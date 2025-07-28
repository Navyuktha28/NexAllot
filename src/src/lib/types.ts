
import { z } from 'zod';

export const StudentSchema = z.object({
  name: z.string().describe('The full name of the student.'),
  hallTicketNumber: z.string().describe('The unique hall ticket number of the student.'),
  branch: z.string().describe('The student\'s branch of study (e.g., CSE, IT, IoT).'),
  contactNumber: z.string().describe('The student\'s contact phone number.'),
});
export type Student = z.infer<typeof StudentSchema>;


export const SeatingAssignmentSchema = z.object({
    name: z.string(),
    hallTicketNumber: z.string(),
    branch: z.string(),
    contactNumber: z.string(),
    block: z.string(),
    floor: z.string(),
    classroom: z.string(),
    benchNumber: z.string(),
});
export type SeatingAssignment = z.infer<typeof SeatingAssignmentSchema>;

export const ExamConfigSchema = z.object({
    startDate: z.string().describe("The start date of the exam period in YYYY-MM-DD format."),
    endDate: z.string().describe("The end date of the exam period in YYYY-MM-DD format."),
    examTimings: z.array(z.string()).describe("An array of exam timing slots for each day."),
    useSamePlan: z.boolean(),
});
export type ExamConfig = z.infer<typeof ExamConfigSchema>;

export const RoomSchema = z.object({
  number: z.string().min(1, 'Room number is required'),
  benches: z.coerce.number().min(1, 'Number of benches must be at least 1'),
  studentsPerBench: z.coerce.number().min(1, 'Students per bench must be at least 1').max(2, 'Maximum students per bench is 2'),
});
export type Room = z.infer<typeof RoomSchema>;

export const FloorSchema = z.object({
  number: z.coerce.number(),
  rooms: z.array(RoomSchema).min(1, 'You must add at least one room to a floor.'),
});
export type Floor = z.infer<typeof FloorSchema>;

export const BlockSchema = z.object({
  name: z.string().min(1, 'Block name is required'),
  floors: z.array(FloorSchema).min(1, 'You must add at least one floor to a block.'),
});
export type Block = z.infer<typeof BlockSchema>;


export const LayoutFormSchema = z.object({
  blocks: z.array(BlockSchema).min(1, 'You must define at least one block.'),
  startDate: z.date(),
  endDate: z.date(),
  examTimings: z.array(z.object({ value: z.string().min(1, 'Timing slot cannot be empty.')})).min(1, 'At least one exam timing is required.'),
});
export type LayoutConfig = z.infer<typeof LayoutFormSchema>;

export const GenerationFormSchema = z.object({
  studentListFiles: z
    .array(z.object({
        file: z.any().refine(file => file?.length === 1, "A file is required."),
    }))
    .min(1, "At least one student list file is required."),
});


export const GenerateSeatingArrangementInputSchema = z.object({
  studentListDataUris: z.array(z.string()).describe(
      "An array of student list files as data URIs. Can be CSV or PDF."
    ),
  layoutConfig: LayoutFormSchema.omit({ startDate: true, endDate: true, examTimings: true }).extend({
      startDate: z.string(),
      endDate: z.string(),
      examTimings: z.array(z.string()),
  })
});
export type GenerateSeatingArrangementInput = z.infer<typeof GenerateSeatingArrangementInputSchema>;

export const RoomBranchSummarySchema = z.record(z.string(), z.record(z.string(), z.number()));
export type RoomBranchSummary = z.infer<typeof RoomBranchSummarySchema>;

export const GenerateSeatingArrangementOutputSchema = z.object({
  seatingPlan: z.array(SeatingAssignmentSchema).optional().describe("The final generated seating arrangement for all students."),
  examConfig: ExamConfigSchema.optional().describe("The exam configuration."),
  roomBranchSummary: RoomBranchSummarySchema.optional().describe("A summary of branch-wise student count per room."),
  allStudents: z.array(StudentSchema).optional().describe("The full list of all students parsed from the input files."),
  error: z.string().optional().describe("An error message if the process fails."),
});
export type GenerateSeatingArrangementOutput = z.infer<typeof GenerateSeatingArrangementOutputSchema>;


export const ValidateFacultyInputSchema = z.object({
  facultyId: z.string().describe("The Faculty ID entered by the user."),
  secureKey: z.string().optional().describe("The secure key entered by the user."),
});
export type ValidateFacultyInput = z.infer<typeof ValidateFacultyInputSchema>;


export const ValidateFacultyOutputSchema = z.object({
  isAuthorized: z.boolean().describe("Whether the faculty member is authorized based on the provided ID and key."),
  error: z.string().optional().describe("An error message if validation fails for a specific reason, e.g., 'Secure key mismatch' or 'Faculty ID not found'."),
});
export type ValidateFacultyOutput = z.infer<typeof ValidateFacultyOutputSchema>;

export const AuthorizedFacultySchema = z.object({
  name: z.string(),
  faculty_id: z.string(),
});
export type AuthorizedFaculty = z.infer<typeof AuthorizedFacultySchema>;


export const PdfRequestSchema = z.object({
    type: z.enum(['attendanceSheet', 'roomList', 'summary']),
    seatingPlan: z.array(SeatingAssignmentSchema),
    examConfig: ExamConfigSchema,
    roomBranchSummary: RoomBranchSummarySchema,
});
export type PdfRequest = z.infer<typeof PdfRequestSchema>;

export const PdfResponseSchema = z.object({
    pdfDataUri: z.string().optional(),
    error: z.string().optional(),
});
export type PdfResponse = z.infer<typeof PdfResponseSchema>;
