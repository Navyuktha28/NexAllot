
"use server";

import fs from "fs/promises";
import path from "path";
import {
  generateSeatingArrangement,
} from "@/ai/flows/seat-arrangement-flow";

import { validateFaculty } from "@/ai/flows/validate-faculty-flow";
import type { GenerateSeatingArrangementInput, ValidateFacultyInput, ExamConfig, LayoutConfig, AuthorizedFaculty, RoomBranchSummary, Student, SeatingAssignment } from '@/lib/types';
import { format } from "date-fns";


const seatingPlanPath = path.resolve(process.cwd(), ".data/seating-plan.json");
const facultyAuthPath = path.resolve(process.cwd(), ".data/faculty-auth.json");

interface SeatingPlanData {
    plan: SeatingAssignment[];
    examConfig: ExamConfig;
    summary: RoomBranchSummary;
    allStudents: Student[];
}

interface FacultyAuthData {
    authorized_faculty: AuthorizedFaculty[];
    secure_key: string;
}

async function readFacultyAuthData(): Promise<FacultyAuthData> {
    try {
        const data = await fs.readFile(facultyAuthPath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
         if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            // If the file doesn't exist, return a default structure
             return { authorized_faculty: [], secure_key: "" };
         }
        console.error("Error reading faculty auth data:", error);
        throw new Error("Could not load faculty authorization data.");
    }
}

async function writeFacultyAuthData(data: FacultyAuthData): Promise<void> {
    await fs.mkdir(path.dirname(facultyAuthPath), { recursive: true });
    await fs.writeFile(facultyAuthPath, JSON.stringify(data, null, 2), 'utf-8');
}


export async function createSeatingPlanAction(
  studentListDataUris: string[],
  layoutConfig: LayoutConfig,
) {
  try {
    const input: GenerateSeatingArrangementInput = {
      studentListDataUris: studentListDataUris,
      layoutConfig: {
        ...layoutConfig,
        // Dates are converted to string for serialization
        startDate: format(layoutConfig.startDate, 'yyyy-MM-dd'),
        endDate: format(layoutConfig.endDate, 'yyyy-MM-dd'),
        examTimings: layoutConfig.examTimings.map(t => t.value)
      },
    };
    
    const {allStudents, ...result} = await generateSeatingArrangement(input);

    if (result.error) {
      return { error: result.error };
    }
    
    const dataToSave = {
        plan: result.seatingPlan,
        examConfig: result.examConfig,
        summary: result.roomBranchSummary,
        allStudents: allStudents // Ensure allStudents is saved
    };

    await fs.mkdir(path.dirname(seatingPlanPath), { recursive: true });
    await fs.writeFile(seatingPlanPath, JSON.stringify(dataToSave, null, 2));

    return { success: true, ...dataToSave };
  } catch (e: unknown) {
    console.error("Error creating seating plan:", e);
     if (e instanceof Error && e.message?.includes("API key not valid")) {
      return {
        error:
          "The provided Gemini API Key is invalid. Please check and try again.",
      };
    }
    return {
      error: e instanceof Error ? e.message : "An unexpected error occurred.",
    };
  }
}

export async function getSeatingDataAction(): Promise<Partial<SeatingPlanData> & { error?: string }> {
  try {
    const data = await fs.readFile(seatingPlanPath, "utf-8");
    const parsedData = JSON.parse(data);
    return { plan: parsedData.plan, examConfig: parsedData.examConfig, summary: parsedData.summary, allStudents: parsedData.allStudents };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Return null instead of an error string to indicate no plan exists
      return {};
    }
    console.error("Error fetching seating data:", error);
    return { error: "Failed to load seating data." };
  }
}

export async function deleteSeatingDataAction() {
    try {
        await fs.unlink(seatingPlanPath);
        return { success: true };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { success: true }; // Already deleted
        }
        console.error("Error deleting seating data:", error);
        return { error: "Failed to delete seating data." };
    }
}

export async function validateFacultyAction(facultyId: string, secureKey?: string): Promise<{
    isValid: boolean;
    error?: string;
}> {
    try {
        const input: ValidateFacultyInput = { facultyId, secureKey };
        const result = await validateFaculty(input);
        return { isValid: result.isAuthorized, error: result.error };
    } catch(e: unknown) {
        console.error("Error validating faculty:", e);
        return { isValid: false, error: e instanceof Error ? e.message : "An unexpected error occurred during validation." };
    }
}

export async function getFacultyAuthDataAction(): Promise<{ success: boolean; data?: FacultyAuthData; error?: string}> {
    try {
        const data = await readFacultyAuthData();
        return { success: true, data };
    } catch (e: unknown) {
        console.error("Error reading faculty auth data:", e);
        return { success: false, error: "Failed to read faculty authorization data." };
    }
}


export async function addFacultyAction(newFaculty: AuthorizedFaculty): Promise<{ success: boolean, error?: string}> {
    if(!newFaculty.name || !newFaculty.faculty_id){
        return { success: false, error: "Faculty name and ID are required."};
    }
    try {
        const authData = await readFacultyAuthData();
        
        const exists = authData.authorized_faculty.some(f => f.faculty_id.toLowerCase() === newFaculty.faculty_id.toLowerCase());
        if(exists){
            return { success: false, error: "A faculty member with this ID already exists."};
        }

        authData.authorized_faculty.push(newFaculty);
        authData.authorized_faculty.sort((a,b) => a.name.localeCompare(b.name));
        
        await writeFacultyAuthData(authData);
        return { success: true };
    } catch (e: unknown) {
        console.error("Error adding faculty:", e);
        return { success: false, error: "Failed to add new faculty member."};
    }
}

export async function deleteFacultyAction(facultyId: string): Promise<{ success: boolean, error?: string}> {
    try {
        const authData = await readFacultyAuthData();
        const initialCount = authData.authorized_faculty.length;
        authData.authorized_faculty = authData.authorized_faculty.filter(f => f.faculty_id !== facultyId);

        if(authData.authorized_faculty.length === initialCount){
             return { success: false, error: "Faculty ID not found to delete."};
        }

        await writeFacultyAuthData(authData);
        return { success: true };
    } catch (e: unknown) {
        console.error("Error deleting faculty:", e);
        return { success: false, error: "Failed to delete faculty member."};
    }
}

export async function updateSecureKeyAction(newKey: string): Promise<{ success: boolean, error?: string}> {
    if(!newKey || newKey.length < 8) {
        return { success: false, error: "Secure key must be at least 8 characters long."};
    }
    try {
        const authData = await readFacultyAuthData();
        authData.secure_key = newKey;
        await writeFacultyAuthData(authData);
        return { success: true };
    } catch (e: unknown) {
         console.error("Error updating secure key:", e);
        return { success: false, error: "Failed to update secure key."};
    }
}
