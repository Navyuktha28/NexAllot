
'use server';
/**
 * @fileOverview This flow handles parsing student files (CSV or PDF) and generating a seating arrangement automatically.
 * 
 * - generateSeatingArrangement - A function that orchestrates the document parsing and seat assignment.
 */

import { ai } from '../genkit';
import { z } from 'zod';
import { GenerateSeatingArrangementInputSchema, GenerateSeatingArrangementOutputSchema, GenerateSeatingArrangementInput, GenerateSeatingArrangementOutput, SeatingAssignment, ExamConfigSchema, Student, RoomBranchSummary, Room, StudentSchema } from '../../lib/types';
import Papa from 'papaparse';


// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function dataUriToBuffer(dataUri: string): Buffer {
    const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
    return Buffer.from(base64, 'base64');
}

// Normalizes a header string for fuzzy matching.
function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, '').trim();
}

// Finds the best-matching original header from a list of possibilities.
function findHeaderMatch(headers: string[], keywords: string[]): string | undefined {
    const normalizedHeaders = headers.map(normalizeHeader);
    for (const keyword of keywords) {
        const normKeyword = normalizeHeader(keyword);
        const index = normalizedHeaders.findIndex(h => h.includes(normKeyword));
        if (index !== -1) return headers[index]; // Return original header
    }
    return undefined;
}


async function parseStudentsFromCSV(csvData: string): Promise<Student[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: header => header.trim(),
            complete: (results) => {
                if (results.errors.length) {
                    console.error("CSV Parsing Errors:", results.errors);
                    return reject(new Error("Failed to parse CSV file. Please check the format."));
                }

                const headers = results.meta.fields || [];
                
                const nameHeader = findHeaderMatch(headers, ["name", "studentname", "fullname", "nameofstudent"]);
                const hallTicketHeader = findHeaderMatch(headers, ["hallticketnumber", "hallticket", "ticketnumber", "htno", "rollno", "roll number"]);
                const branchHeader = findHeaderMatch(headers, ["branch", "department", "stream"]);
                const contactHeader = findHeaderMatch(headers, ["contactnumber", "phone", "phonenumber", "mobile", "contact no"]);

                if (!nameHeader) return reject(new Error("Could not find a 'Name' column. Please ensure your CSV has a column for student names (e.g., 'Name', 'FullName')."));
                if (!hallTicketHeader) return reject(new Error("Could not find a 'Hall Ticket Number' column. Please ensure your CSV has a column for hall tickets (e.g., 'HallTicket', 'Roll No')."));
                if (!branchHeader) return reject(new Error("Could not find a 'Branch' column. Please ensure your CSV has a column for student branch (e.g., 'Branch', 'Department')."));
                if (!contactHeader) return reject(new Error("Could not find a 'Contact Number' column. Please ensure your CSV has a column for contact info (e.g., 'Phone', 'ContactNumber')."));


                const students: Student[] = (results.data as Record<string, string>[]).map(row => ({
                    name: row[nameHeader] || '',
                    hallTicketNumber: row[hallTicketHeader] || '',
                    branch: row[branchHeader] || '',
                    contactNumber: row[contactHeader] || '',
                })).filter(s => s.name && s.hallTicketNumber);
                
                resolve(students);
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });
}


async function parseStudentsFromPDF(pdfBuffer: Buffer): Promise<Student[]> {
    const pdf = (await import('pdf-parse')).default;
    const data = await pdf(pdfBuffer);
    const lines = data.text.split('\n').filter((line: string) => line.trim() !== '');

    if (lines.length < 2) {
      throw new Error("PDF content is not in a valid table format.");
    }

    // Treat the first line as headers, trim each header.
    const headers = lines[0].trim().split(/\s{2,}/).map((h: string) => h.trim());
    
    const nameHeader = findHeaderMatch(headers, ["name", "studentname", "fullname", "nameofstudent"]);
    const hallTicketHeader = findHeaderMatch(headers, ["hallticketnumber", "hallticket", "ticketnumber", "htno", "rollno", "roll number"]);
    const branchHeader = findHeaderMatch(headers, ["branch", "department", "stream"]);
    const contactHeader = findHeaderMatch(headers, ["contactnumber", "phone", "phonenumber", "mobile", "contact no"]);


    if (!nameHeader) throw new Error("Could not find a 'Name' column in the PDF. Please ensure your PDF has a column for student names.");
    if (!hallTicketHeader) throw new Error("Could not find a 'Hall Ticket Number' column in the PDF. Please ensure your PDF has a column for hall tickets.");
    if (!branchHeader) throw new Error("Could not find a 'Branch' column in the PDF. Please ensure your PDF has a column for student branch.");
    if (!contactHeader) throw new Error("Could not find a 'Contact Number' column in the PDF. Please ensure your PDF has a column for contact info.");

    const nameIndex = headers.indexOf(nameHeader);
    const hallTicketIndex = headers.indexOf(hallTicketHeader);
    const branchIndex = headers.indexOf(branchHeader);
    const contactIndex = headers.indexOf(contactHeader);

    // This regex is designed to split columns based on two or more spaces,
    // which is common for text-based tables in PDFs.
    const students: Student[] = lines.slice(1)
        .map((line: string) => {
            const parts = line.trim().split(/\s{2,}/).map(p => p.trim());
            if(parts.length < headers.length) return null;
            return {
                name: parts[nameIndex] || '',
                hallTicketNumber: parts[hallTicketIndex] || '',
                branch: parts[branchIndex] || '',
                contactNumber: parts[contactIndex] || '',
            };
        })
        .filter((s: Student | null): s is Student => s !== null && !!s.hallTicketNumber && !!s.name);

    if (students.length === 0) {
        throw new Error("Could not parse any students from the PDF. Please check the file's text format.");
    }
    
    return students;
}


const seatingArrangementFlow = ai.defineFlow(
  {
    name: 'seatingArrangementFlow',
    inputSchema: GenerateSeatingArrangementInputSchema as any,
    outputSchema: GenerateSeatingArrangementOutputSchema.extend({ allStudents: z.array(StudentSchema).optional() }) as any,
  },
  async (input) => {
    
    let allStudents: Student[] = [];
    try {
        for(const dataUri of input.studentListDataUris) {
            const buffer = dataUriToBuffer(dataUri);
            let students: Student[];
            if (dataUri.startsWith('data:application/pdf')) {
                 students = await parseStudentsFromPDF(buffer);
            } else if (dataUri.startsWith('data:text/csv') || dataUri.startsWith('data:application/vnd.ms-excel')) {
                 students = await parseStudentsFromCSV(buffer.toString('utf-8'));
            } else {
                // Try to infer from buffer if mime type is generic
                try {
                    students = await parseStudentsFromPDF(buffer);
                } catch (pdfError) {
                    try {
                        students = await parseStudentsFromCSV(buffer.toString('utf-8'));
                    } catch (csvError) {
                         throw new Error('Unsupported file type. Please upload a valid CSV or PDF file.');
                    }
                }
            }
            allStudents.push(...students);
        }
    } catch(e: unknown) {
        return { error: e instanceof Error ? e.message : "Failed to parse one or more student files."};
    }
    
    if (!allStudents || allStudents.length === 0) {
        return { error: "Could not extract any student data from the uploaded files. Please ensure files are correctly formatted and not empty." };
    }
    
    const layout = input.layoutConfig;
    
    let totalCapacity = 0;
    layout.blocks.forEach((b: { floors: { rooms: { benches: number; studentsPerBench: number }[] }[] }) => 
        b.floors.forEach((f: { rooms: { benches: number; studentsPerBench: number }[] }) => 
            f.rooms.forEach((r: { benches: number; studentsPerBench: number }) => 
                totalCapacity += r.benches * r.studentsPerBench
            )
        )
    );

    if (allStudents.length > totalCapacity) {
        // This is not an error, we just can't seat everyone. The absentees list will show who was left out.
        // We will continue and seat as many as possible.
    }
    
    const studentsByBranch: Record<string, Student[]> = {};
    allStudents.forEach(student => {
        if (!studentsByBranch[student.branch]) {
            studentsByBranch[student.branch] = [];
        }
        studentsByBranch[student.branch].push(student);
    });

    Object.values(studentsByBranch).forEach(shuffleArray);
    
    const branchNames = shuffleArray(Object.keys(studentsByBranch));
    let studentPool = branchNames.flatMap(branch => studentsByBranch[branch]);

    const seatingPlan: SeatingAssignment[] = [];
    let studentIndex = 0;

    for (const block of layout.blocks) {
      for (const floor of block.floors) {
        for (const room of floor.rooms) {
          if (studentIndex >= totalCapacity) break; // Stop if we've hit total capacity
          
          let benchCounter = 1;
          const roomCapacity = Math.min(room.benches, 45) * room.studentsPerBench;
          
          for (let i = 0; i < roomCapacity; i++) {
            if (studentIndex >= totalCapacity || studentPool.length === 0) break;

            const seatInfo = {
                block: block.name,
                floor: String(floor.number),
                classroom: room.number,
            };

            if (room.studentsPerBench === 1) {
                const student = studentPool.shift();
                if (student) {
                    seatingPlan.push({ ...student, ...seatInfo, benchNumber: String(benchCounter++) });
                    studentIndex++;
                }
            } else if (room.studentsPerBench === 2) {
                if (studentPool.length < 2) {
                    const student = studentPool.shift();
                     if (student) {
                        seatingPlan.push({ ...student, ...seatInfo, benchNumber: `${benchCounter}L` });
                        studentIndex++;
                        benchCounter++; // Add this line to increment bench counter
                    }
                    continue; // Move to next room/block
                }

                let student1 = studentPool[0];
                let student2: Student | undefined = undefined;

                // Find a student from a different branch
                const differentBranchIndex = studentPool.findIndex(s => s.branch !== student1.branch);

                if (differentBranchIndex !== -1) {
                    student2 = studentPool.splice(differentBranchIndex, 1)[0];
                } else {
                    // If all remaining students are from the same branch, take the next one
                    student2 = studentPool[1];
                    studentPool.splice(1, 1);
                }
                
                // Remove student1 from the pool
                studentPool.shift();
                
                seatingPlan.push({ ...student1, ...seatInfo, benchNumber: `${benchCounter}L` });
                studentIndex++;
                if (studentIndex >= totalCapacity) break;

                if (student2) {
                    seatingPlan.push({ ...student2, ...seatInfo, benchNumber: `${benchCounter}R` });
                    studentIndex++;
                }

                benchCounter++;
                i++; // we've filled two spots
            }
          }
        }
      }
    }

    seatingPlan.sort((a,b) => a.hallTicketNumber.localeCompare(b.hallTicketNumber));


    const examConfig: z.infer<typeof ExamConfigSchema> = {
        startDate: layout.startDate,
        endDate: layout.endDate,
        examTimings: layout.examTimings,
        useSamePlan: true,
    };

    const roomBranchSummary: RoomBranchSummary = {};
    seatingPlan.forEach(assignment => {
        const { classroom, branch } = assignment;
        if (!roomBranchSummary[classroom]) {
            roomBranchSummary[classroom] = {};
        }
        if (!roomBranchSummary[classroom][branch]) {
            roomBranchSummary[classroom][branch] = 0;
        }
        roomBranchSummary[classroom][branch]++;
    });

    return { seatingPlan, examConfig, roomBranchSummary, allStudents };
  }
);


export async function generateSeatingArrangement(
  input: GenerateSeatingArrangementInput
): Promise<GenerateSeatingArrangementOutput & { allStudents?: Student[] }> {
  return seatingArrangementFlow(input);
}
