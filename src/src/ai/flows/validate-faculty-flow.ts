
'use server';
/**
 * @fileOverview Validates a faculty member's credentials against a structured data file.
 *
 * - validateFaculty - A function that handles faculty ID and secure key validation.
 */
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { ValidateFacultyInputSchema, ValidateFacultyOutputSchema, ValidateFacultyInput, ValidateFacultyOutput } from '../../lib/types';

const facultyAuthPath = path.resolve(process.cwd(), ".data/faculty-auth.json");

async function getFacultyData() {
    try {
        const data = await fs.readFile(facultyAuthPath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            const defaultData = {
                authorized_faculty: [
                    { "name": "Ramesh", "faculty_id": "MRUE2109T029" },
                    { "name": "Sravani", "faculty_id": "MRUE2109T045" },
                    { "name": "Naveen", "faculty_id": "MRUE2109T052" },
                    { "name": "Divya", "faculty_id": "MRUE2109T061" }
                ],
                secure_key: "FACULTY@2025#ACCESS"
            };
            await fs.mkdir(path.dirname(facultyAuthPath), { recursive: true });
            await fs.writeFile(facultyAuthPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        console.error("Error reading faculty auth data:", error);
        throw new Error("Could not load faculty authorization data.");
    }
}


export async function validateFaculty(input: ValidateFacultyInput): Promise<ValidateFacultyOutput> {
    const authData = await getFacultyData();

    const facultyMember = authData.authorized_faculty.find(
        (faculty: { faculty_id: string }) => 
          faculty.faculty_id.toLowerCase() === input.facultyId.toLowerCase()
    );

    if (!facultyMember) {
        return { isAuthorized: false, error: "Faculty ID not found." };
    }

    // If a secure key is provided for validation, it must match.
    if (input.secureKey) {
        if (input.secureKey !== authData.secure_key) {
             return { isAuthorized: false, error: "Secure key mismatch." };
        }
    }

    // If we reach here, it means:
    // 1. The faculty ID was found.
    // 2. EITHER a secure key was provided and it matched, OR no secure key was provided for validation.
    // In the context of the simple admin login from the main page, we only check for the ID.
    // In the faculty tools view, we check for both ID and key. This logic supports both cases.
    return { isAuthorized: true };
}
