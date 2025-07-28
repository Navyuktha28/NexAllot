
"use client";

import React from "react";
import { useState } from "react";
import { Bot, Home as HomeIcon, LogIn, User, Settings, ShieldCheck } from "lucide-react";
import AdminDashboard from "../components/admin-dashboard";
import FacultyView from "../components/faculty-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";
import { useTransition } from "react";
import { validateFacultyAction } from "../lib/actions";
import StudentDashboard from "../components/student-dashboard";


export default function Home() {
  const [activeTab, setActiveTab] = useState("admin");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isStudentLoggedIn, setIsStudentLoggedIn] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [facultyId, setFacultyId] = useState("");
  const [hallTicketNumber, setHallTicketNumber] = useState("");
  const [submittedHallTicket, setSubmittedHallTicket] = useState("");
  const { toast } = useToast();

  const handleAdminLogin = () => {
     startTransition(async () => {
        const result = await validateFacultyAction(facultyId);
        if (result.isValid) {
            setIsAdminLoggedIn(true);
        } else {
            toast({
                variant: "destructive",
                title: "Login Failed",
                description: result.error || "Unauthorized Faculty ID",
            });
        }
    });
  };

  const handleStudentLogin = () => {
    if (hallTicketNumber.trim()) {
        setSubmittedHallTicket(hallTicketNumber);
        setIsStudentLoggedIn(true);
    } else {
        toast({
            variant: "destructive",
            title: "Invalid Input",
            description: "Please enter a hall ticket number.",
        });
    }
  };
  
  const handleBackToHome = () => {
    setIsAdminLoggedIn(false);
    setIsStudentLoggedIn(false);
    setFacultyId("");
    setHallTicketNumber("");
    setSubmittedHallTicket("");
    // Reset to the default tab if needed, e.g., 'admin'
    setActiveTab("admin");
  };

  const renderContent = () => {
    if (isAdminLoggedIn) {
        return <AdminDashboard />;
    }
    if (isStudentLoggedIn) {
        return <StudentDashboard hallTicketNumber={submittedHallTicket} onBackToHome={handleBackToHome} />;
    }
    
    return (
        <Card className="w-full max-w-md shadow-lg bg-card/80 backdrop-blur-sm">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <CardHeader className="items-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                        <LogIn className="h-6 w-6"/> Login
                    </CardTitle>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="admin"><ShieldCheck className="mr-2 h-4 w-4"/>Admin</TabsTrigger>
                        <TabsTrigger value="student"><User className="mr-2 h-4 w-4"/>Student</TabsTrigger>
                        <TabsTrigger value="faculty"><Settings className="mr-2 h-4 w-4"/>Faculty Tools</TabsTrigger>
                    </TabsList>
                </CardHeader>

                <TabsContent value="admin">
                    <CardContent className="space-y-4">
                         <CardDescription className="text-center">
                            Please enter your Faculty ID to manage seating.
                        </CardDescription>
                        <Input 
                            placeholder="Enter Faculty ID"
                            value={facultyId}
                            onChange={(e) => setFacultyId(e.target.value)}
                            disabled={isPending}
                        />
                    </CardContent>
                    <CardFooter>
                         <Button 
                            className="w-full" 
                            onClick={handleAdminLogin}
                            disabled={isPending}
                        >
                            {isPending ? "Logging in..." : "Admin Login"}
                        </Button>
                    </CardFooter>
                </TabsContent>

                <TabsContent value="student">
                     <CardContent className="space-y-4">
                         <CardDescription className="text-center">
                            Please enter your Hall Ticket Number to view your seat.
                        </CardDescription>
                        <Input 
                            placeholder="Enter Hall Ticket Number"
                            value={hallTicketNumber}
                            onChange={(e) => setHallTicketNumber(e.target.value)}
                         />
                    </CardContent>
                    <CardFooter>
                         <Button 
                            className="w-full" 
                            onClick={handleStudentLogin}
                        >
                           Student Login
                        </Button>
                    </CardFooter>
                </TabsContent>

                <TabsContent value="faculty">
                   <CardContent>
                        <FacultyView />
                   </CardContent>
                </TabsContent>
            </Tabs>
        </Card>
    );
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 lg:p-8">
      <header className="absolute top-8 w-full text-center">
        <div className="flex items-center gap-2 justify-center">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">
            Nex<span className="text-primary">Allot</span>
          </h1>
        </div>
        <p className="text-muted-foreground mt-2 italic">
          check it out!!
        </p>
      </header>
       
       {(isAdminLoggedIn || isStudentLoggedIn) && (
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-8 right-8"
                onClick={handleBackToHome}
            >
                <HomeIcon />
                <span className="sr-only">Home</span>
            </Button>
       )}

      <main className="w-full flex items-center justify-center pt-24">
        {renderContent()}
      </main>
    </div>
  );
}
