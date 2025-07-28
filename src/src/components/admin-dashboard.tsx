"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller, Control, UseFormRegister, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { useToast } from "../hooks/use-toast";
import { createSeatingPlanAction, getSeatingDataAction, deleteSeatingDataAction } from "../lib/actions";
import {
  FileUp,
  Loader2,
  Table,
  Trash2,
  CalendarIcon,
  PlusCircle,
  X,
  Users,
  Download,
  List,
} from "lucide-react";
import { SeatingTable } from "./seating-table";
import { ExamConfig, SeatingAssignment, LayoutFormSchema, GenerationFormSchema, RoomBranchSummary, Student } from "../lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { useEffect } from "react";
import { Separator } from "./ui/separator";
import { Table as ShadTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Resolver } from "react-hook-form";

const fileToDataUri = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });

type LayoutFormType = z.infer<typeof LayoutFormSchema>;
type GenerationFormType = z.infer<typeof GenerationFormSchema>;


interface DisplaySeatingData {
    plan: SeatingAssignment[];
    examConfig: Omit<ExamConfig, 'startDate' | 'endDate'> & {
        startDate: Date;
        endDate: Date;
    };
    summary: RoomBranchSummary;
    allStudents: Student[];
}

const triggerDownload = (dataUri: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const addPdfHeader = (doc: jsPDF, seatingData: DisplaySeatingData | null, pageNumber: number, totalPages: number) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Add University Name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("MALLA REDDY UNIVERSITY", pageWidth / 2, 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');


    // Add Absentees section only on the first page
    if (pageNumber === 1 && seatingData && seatingData.allStudents) {
        const assignedHallTickets = new Set(seatingData.plan.map(s => s.hallTicketNumber));
        const absentees = seatingData.allStudents.filter(s => !assignedHallTickets.has(s.hallTicketNumber));
        
        const absenteesByBranch: Record<string, string[]> = {};
        const allBranches = [...new Set(seatingData.allStudents.map(s => s.branch))];

        allBranches.forEach(branch => {
            absenteesByBranch[branch] = absentees
                .filter(s => s.branch === branch)
                .map(s => s.hallTicketNumber);
        });

        let yPos = 30; // Starting Y position for absentees section
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("Absentees:", 15, yPos);
        yPos += 5;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        Object.entries(absenteesByBranch).forEach(([branch, rollNumbers]) => {
            if (yPos > pageHeight - 30) { // Check for page break
                doc.addPage();
                yPos = 20;
            }
            doc.setFont('helvetica', 'bold');
            doc.text(`${branch} Absentees Roll Numbers:`, 15, yPos);
            yPos += 5;
            doc.setLineWidth(0.2);
            doc.line(15, yPos - 2, pageWidth - 15, yPos - 2);
            
            doc.setFont('helvetica', 'normal');
            
            if (rollNumbers.length > 0) {
                 const rollNumberText = rollNumbers.join(", ");
                 const splitText = doc.splitTextToSize(rollNumberText, pageWidth - 30);
                 doc.text(splitText, 15, yPos);
                 yPos += (splitText.length * 5) + 5;
            } else {
                 doc.text("None", 15, yPos);
                 yPos += 10;
            }
        });
        
         // Add a separator before the main content
         doc.setLineWidth(0.5);
         doc.line(15, yPos, pageWidth - 15, yPos);
         
         // Set startY for autotable
         return yPos + 10;
    }
    
    return 30; // Default startY for other pages
};


export default function AdminDashboard() {
  const [step, setStep] = useState(1);
  const [layoutConfig, setLayoutConfig] = useState<LayoutFormType | null>(null);
  const [isGenerating, startGeneration] = useTransition();
  const [isDeleting, startDeletion] = useTransition();
  const [isLoading, startLoading] = useTransition();
  const [isDownloadingAttendance, startDownloadingAttendance] = useTransition();
  const [isDownloadingSummary, startDownloadingSummary] = useTransition();
  const [seatingData, setSeatingData] = useState<DisplaySeatingData | null>(null);
  const { toast } = useToast();

  const layoutForm = useForm<z.infer<typeof LayoutFormSchema>>({
    resolver: zodResolver(LayoutFormSchema) as Resolver<LayoutFormType>,
    defaultValues: {
      blocks: [
        {
          name: "Main Block",
          floors: [
            {
              number: 1,
              rooms: [
                {
                  number: "101",
                  benches: 15,
                  studentsPerBench: 2,
                },
              ],
            },
          ],
        },
      ],
      startDate: new Date(),
      endDate: new Date(),
      examTimings: [{ value: "09:00 AM to 12:00 PM" }]
    }
  });

  const { fields: blockFields, append: appendBlock, remove: removeBlock } = useFieldArray({
    control: layoutForm.control,
    name: "blocks"
  });
  
  const { fields: timingFields, append: appendTiming, remove: removeTiming } = useFieldArray({
      control: layoutForm.control,
      name: "examTimings"
  });

  const generationForm = useForm<GenerationFormType>({
    resolver: zodResolver(GenerationFormSchema),
    defaultValues: {
        studentListFiles: [{ file: undefined }]
    }
  });

  const { fields: fileFields, append: appendFile, remove: removeFile } = useFieldArray({
      control: generationForm.control,
      name: "studentListFiles"
  });

  useEffect(() => {
    startLoading(async () => {
      const data = await getSeatingDataAction();
      if (data.plan && data.examConfig && data.summary) {
        setSeatingData({
            plan: data.plan,
            examConfig: {
                ...data.examConfig,
                startDate: new Date(data.examConfig.startDate),
                endDate: new Date(data.examConfig.endDate),
            },
            summary: data.summary,
            allStudents: data.allStudents || [],
        });
      }
    });
  }, []);

  const handleLayoutSubmit: SubmitHandler<LayoutFormType> = (data) => {
    setLayoutConfig(data);
    setStep(2);
  };

  const handleGenerationSubmit: SubmitHandler<GenerationFormType> = (data) => {
    startGeneration(async () => {
      if (!layoutConfig) {
        toast({ variant: "destructive", title: "Error", description: "Layout configuration is missing." });
        return;
      }
      
      const files: File[] = data.studentListFiles.map(f => f.file[0]).filter(Boolean);

      if (files.length === 0) {
          toast({ variant: "destructive", title: "Error", description: "Please upload at least one student file." });
          return;
      }

      const studentListDataUris = await Promise.all(files.map(fileToDataUri));

      const result = await createSeatingPlanAction(
        studentListDataUris,
        layoutConfig
      );

      if ('error' in result) {
        toast({
          variant: "destructive",
          title: "Error Creating Plan",
          description: result.error || "An unexpected error occurred.",
        });
      } else if (result.success && result.plan && result.examConfig && result.summary) {
        toast({
          title: "Success",
          description: "Seating plan created successfully.",
        });
        setSeatingData({
            plan: result.plan,
            examConfig: {
                ...result.examConfig,
                startDate: new Date(result.examConfig.startDate),
                endDate: new Date(result.examConfig.endDate),
            },
            summary: result.summary,
            allStudents: result.allStudents || [],
        });
      }
    });
  };

  const handleDelete = () => {
    startDeletion(async () => {
        const result = await deleteSeatingDataAction();
        if (result.success) {
            setSeatingData(null);
            setStep(1);
            setLayoutConfig(null);
            layoutForm.reset();
            generationForm.reset();
            toast({
                title: 'Plan Deleted',
                description: 'The seating plan has been cleared.',
            });
        } else {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: result.error,
            });
        }
    });
  };

  const groupStudentsByRoom = (plan: SeatingAssignment[]) => {
      return plan.reduce((acc, student) => {
          const room = student.classroom;
          if(!acc[room]){
              acc[room] = [];
          }
          acc[room].push(student);
          
          acc[room].sort((a,b) => {
            const numA = parseInt(a.benchNumber.replace(/[^0-9]/g, ''), 10);
            const numB = parseInt(b.benchNumber.replace(/[^0-9]/g, ''), 10);
            const sideA = a.benchNumber.replace(/[^LR]/g, '');
            const sideB = b.benchNumber.replace(/[^LR]/g, '');

            if (numA !== numB) {
                return numA - numB;
            }
            return sideA.localeCompare(sideB);
          });
          return acc;
      }, {} as Record<string, SeatingAssignment[]>);
  };
  
  const handleDownloadSummaryPdf = () => {
    startDownloadingSummary(() => {
        if(!seatingData) return;
        const doc = new jsPDF();
        doc.text("Room Occupancy Summary", 14, 16);
        const tableData: (string | number)[][] = [];
        Object.entries(seatingData.summary).forEach(([room, branches]) => {
            Object.entries(branches).forEach(([branch, count]) => {
                tableData.push([room, branch, count]);
            });
        });
        autoTable(doc, {
            head: [['Room', 'Branch', 'Student Count']],
            body: tableData,
            startY: 20,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        });
        triggerDownload(doc.output('datauristring'), 'room_occupancy_summary.pdf');
    });
  };

  const handleDownloadAttendanceSheetPdf = () => {
    startDownloadingAttendance(() => {
        if (!seatingData) return;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const studentsByRoom = groupStudentsByRoom(seatingData.plan);
        const totalPages = Object.keys(studentsByRoom).length;

        Object.entries(studentsByRoom).forEach(([room, students], index) => {
            if (index > 0) doc.addPage();
            
            const startY = addPdfHeader(doc, seatingData, index + 1, totalPages);
            
            doc.setFontSize(14);
            doc.text(`Seating Arrangement - Room: ${room}`, 15, startY);
            doc.setFontSize(10);
            doc.text(`Date: ${format(seatingData.examConfig.startDate, 'dd/MM/yyyy')}`, 15, startY + 7);

            const tableData = students.map(s => [s.benchNumber, s.name, s.hallTicketNumber, s.branch, '', '']);
            
            autoTable(doc, {
                head: [['Bench', 'Name', 'Hallticket Number', 'Branch', 'Booklet Number', 'Signature']],
                body: tableData,
                startY: startY + 15,
                theme: 'grid',
                headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
                styles: { cellPadding: 2, fontSize: 9 },
                columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 30 }, 3: { cellWidth: 20 }, 4: { cellWidth: 30 }, 5: { cellWidth: 30 } },
            });
        });

        triggerDownload(doc.output('datauristring'), 'attendance_sheets.pdf');
    });
  };


  if (isLoading) {
    return (
        <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="ml-2">Loading existing plan...</p>
        </div>
    )
  }

  if (seatingData) {
    const studentsByRoom = groupStudentsByRoom(seatingData.plan);
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>Generated Seating Plan</span>
                </CardTitle>
                <CardDescription>
                    The seating plan has been successfully generated. Review, download, or delete the plan below.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <SeatingTable data={seatingData.plan} />
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
                 <Button onClick={handleDownloadAttendanceSheetPdf} variant="outline" disabled={isDownloadingAttendance}>
                    {isDownloadingAttendance ? <Loader2 className="mr-2 animate-spin" /> : <Download className="mr-2" />}
                    Download Attendance Sheets
                </Button>
                 <Button onClick={handleDelete} variant="destructive" disabled={isDeleting} className="ml-auto">
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2" />}
                    Delete Plan
                </Button>
            </CardFooter>
        </Card>
        
        <Card className="shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Users />
                       <span>Room Occupancy Summary</span>
                    </CardTitle>
                    <CardDescription>
                        Branch-wise student count in each room.
                    </CardDescription>
                </div>
                 <Button onClick={handleDownloadSummaryPdf} variant="outline" size="sm" disabled={isDownloadingSummary}>
                    {isDownloadingSummary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download Summary PDF
                </Button>
            </CardHeader>
             <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {Object.entries(seatingData.summary).map(([room, branches]) => (
                         <div key={room} className="p-4 rounded-lg bg-muted/50">
                             <h4 className="font-semibold text-primary mb-2">Room: {room}</h4>
                             <ul className="space-y-1 text-sm">
                                 {Object.entries(branches).map(([branch, count]) => (
                                     <li key={branch} className="flex justify-between">
                                         <span>{branch}:</span>
                                         <span className="font-medium">{count} student(s)</span>
                                     </li>
                                 ))}
                             </ul>
                         </div>
                     ))}
                 </div>
             </CardContent>
        </Card>

        <Card className="shadow-lg">
             <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <List />
                    <span>Room-wise Student List</span>
                </CardTitle>
                <CardDescription>
                    Detailed student seating arrangement for each room.
                </CardDescription>
            </CardHeader>
             <CardContent className="space-y-6">
                 {Object.entries(studentsByRoom).map(([room, students]) => (
                     <div key={room}>
                        <h3 className="font-bold text-lg mb-2 text-primary border-b pb-1">Room: {room}</h3>
                        <div className="rounded-md border">
                            <ShadTable>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Bench</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Roll Number</TableHead>
                                        <TableHead>Branch</TableHead>
                                        <TableHead>Booklet Number</TableHead>
                                        <TableHead>Signature</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {students.map(student => (
                                        <TableRow key={student.hallTicketNumber}>
                                            <TableCell>{student.benchNumber}</TableCell>
                                            <TableCell>{student.name}</TableCell>
                                            <TableCell>{student.hallTicketNumber}</TableCell>
                                            <TableCell>{student.branch}</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </ShadTable>
                        </div>
                     </div>
                 ))}
             </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 1) {
    return (
      <Card className="w-full max-w-4xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>Seating Setup - Step 1: Layout Configuration</CardTitle>
          <CardDescription>
            Define the physical layout of your examination halls by adding blocks, floors, and rooms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...layoutForm}>
            <form onSubmit={layoutForm.handleSubmit(handleLayoutSubmit as any)} className="space-y-6">
              {blockFields.map((block, blockIndex) => (
                <Card key={block.id} className="p-4 border-dashed relative">
                   <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removeBlock(blockIndex)}>
                        <X className="h-4 w-4"/>
                    </Button>
                  <CardHeader className="p-2">
                    <CardTitle className="text-lg">Block {blockIndex + 1}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 space-y-4">
                    <FormField
                      control={layoutForm.control as any}
                      name={`blocks.${blockIndex}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Block Name</FormLabel>
                          <FormControl><Input placeholder="e.g., Main Block" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FloorsField blockIndex={blockIndex} control={layoutForm.control} register={layoutForm.register} getValues={layoutForm.getValues} setValue={layoutForm.setValue} />
                  </CardContent>
                </Card>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() => appendBlock({ name: "", floors: [{ number: 1, rooms: [] }] })}
                className="flex items-center gap-2"
              >
                <PlusCircle /> Add Another Block
              </Button>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField control={layoutForm.control as any} name="startDate" render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>Exam Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={layoutForm.control as any} name="endDate" render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>Exam End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}/>
                </div>
                <div>
                    <FormLabel>Exam Timings</FormLabel>
                    <div className="space-y-2">
                        {timingFields.map((field, index) => (
                            <FormField 
                                key={field.id}
                                control={layoutForm.control as any}
                                name={`examTimings.${index}.value`}
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center gap-2">
                                            <FormControl>
                                                <Input placeholder="e.g., 09:00 AM to 12:00 PM" {...field}/>
                                            </FormControl>
                                            {timingFields.length > 1 && (
                                                <Button variant="ghost" size="icon" onClick={() => removeTiming(index)}>
                                                    <X className="h-4 w-4"/>
                                                </Button>
                                            )}
                                        </div>
                                        <FormMessage/>
                                    </FormItem>
                                )}
                            />
                        ))}
                    </div>
                     <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => appendTiming({ value: "" })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4"/>
                        Add Time Slot
                    </Button>
                </div>


              <Button type="submit" className="w-full">
                Continue to Step 2
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    )
  }

  if (step === 2) {
    return (
      <Card className="w-full max-w-lg mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>Seating Setup - Step 2: Upload Student Lists</CardTitle>
          <CardDescription>
            Upload one or more student list files in CSV or PDF format. Each file can represent a different branch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...generationForm}>
            <form onSubmit={generationForm.handleSubmit(handleGenerationSubmit)} className="space-y-6">
              <div className="space-y-4">
                {fileFields.map((field, index) => (
                    <FormField
                    key={field.id}
                    control={generationForm.control}
                    name={`studentListFiles.${index}.file`}
                    render={({ field: { onChange, value, ...rest } }) => (
                      <FormItem>
                        <FormLabel className={cn(index !== 0 && "sr-only")}>
                         Student List Files (CSV, PDF)
                        </FormLabel>
                         <div className="flex items-center gap-2">
                            <FormControl>
                                <Input
                                    type="file"
                                    accept=".csv,.pdf,application/vnd.ms-excel"
                                    onChange={(e) => onChange(e.target.files)}
                                    {...rest}
                                />
                            </FormControl>
                            {fileFields.length > 1 && (
                                <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendFile({ file: undefined })}
                >
                    <PlusCircle className="mr-2 h-4 w-4"/>
                    Add Another File
                </Button>
              </div>
                <FormDescription>
                  Ensure each file has columns/headers for: name, hallTicketNumber, branch, contactNumber.
                </FormDescription>

               <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="w-1/3">Back to Step 1</Button>
                <Button
                  type="submit"
                  className="w-2/3"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Table className="mr-2 h-4 w-4" />
                  )}
                  Generate Seating Plan
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  return null;
}

const FloorsField = ({ blockIndex, control, register, getValues, setValue }: { 
  blockIndex: number, 
  control: Control<LayoutFormType>, 
  register: UseFormRegister<LayoutFormType>, 
  getValues: UseFormGetValues<LayoutFormType>, 
  setValue: UseFormSetValue<LayoutFormType> 
}) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `blocks.${blockIndex}.floors`
    });

    return (
        <div className="space-y-4 pl-4 border-l-2">
            {fields.map((floor, floorIndex) => (
                <Card key={floor.id} className="p-3 bg-muted/40 relative">
                     <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => remove(floorIndex)}>
                        <X className="h-4 w-4"/>
                    </Button>
                    <CardContent className="p-1 space-y-4">
                        <FormField
                            control={control}
                            name={`blocks.${blockIndex}.floors.${floorIndex}.number`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Floor Number</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g., 1" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <RoomsField blockIndex={blockIndex} floorIndex={floorIndex} control={control} register={register} getValues={getValues} setValue={setValue} />
                    </CardContent>
                </Card>
            ))}
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => append({ number: fields.length + 1, rooms: [{ number: "", benches: 10, studentsPerBench: 2}] })}
                className="flex items-center gap-2"
            >
                <PlusCircle /> Add Floor
            </Button>
        </div>
    );
};

const RoomsField = ({ blockIndex, floorIndex, control, register, getValues, setValue }: { 
  blockIndex: number, 
  floorIndex: number, 
  control: Control<LayoutFormType>, 
  register: UseFormRegister<LayoutFormType>, 
  getValues: UseFormGetValues<LayoutFormType>, 
  setValue: UseFormSetValue<LayoutFormType> 
}) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `blocks.${blockIndex}.floors.${floorIndex}.rooms`
    });
    
    const watchRoomFields = getValues(`blocks.${blockIndex}.floors.${floorIndex}.rooms`);

    return (
        <div className="space-y-3 pl-4">
            <h4 className="text-sm font-medium">Rooms</h4>
            {fields.map((room, roomIndex) => (
                <div key={room.id} className="p-3 rounded-md bg-background border grid grid-cols-1 md:grid-cols-4 gap-3 relative">
                     <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => remove(roomIndex)}>
                        <X className="h-4 w-4"/>
                    </Button>
                    <FormField
                        control={control}
                        name={`blocks.${blockIndex}.floors.${floorIndex}.rooms.${roomIndex}.number`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Room No.</FormLabel>
                                <FormControl><Input placeholder="101" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={control}
                        name={`blocks.${blockIndex}.floors.${floorIndex}.rooms.${roomIndex}.benches`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs"># Benches</FormLabel>
                                <FormControl><Input type="number" placeholder="15" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={control}
                        name={`blocks.${blockIndex}.floors.${floorIndex}.rooms.${roomIndex}.studentsPerBench`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Students/Bench</FormLabel>
                                <FormControl><Input type="number" placeholder="2" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)}/></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <div className="flex items-end">
                        <p className="text-xs text-muted-foreground">
                            Capacity: {(watchRoomFields?.[roomIndex]?.benches || 0) * (watchRoomFields?.[roomIndex]?.studentsPerBench || 0)}
                        </p>
                    </div>
                </div>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ number: "", benches: 10, studentsPerBench: 2})}
                className="flex items-center gap-2"
            >
                <PlusCircle /> Add Room
            </Button>
        </div>
    );
}

