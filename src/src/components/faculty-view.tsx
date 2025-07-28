
'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
    validateFacultyAction, 
    getFacultyAuthDataAction, 
    addFacultyAction,
    deleteFacultyAction,
    updateSecureKeyAction
} from '@/lib/actions';
import {
  KeyRound,
  UserCheck,
  Loader2,
  Unlock,
  ShieldAlert,
  Edit,
  UserPlus,
  Trash2,
  Lock,
  Save
} from 'lucide-react';
import type { AuthorizedFaculty } from '@/lib/types';
import { Separator } from './ui/separator';

const LoginSchema = z.object({
  facultyId: z.string().min(1, 'Faculty ID is required.'),
  secureKey: z.string().min(1, 'Secure key is required.'),
});
type LoginType = z.infer<typeof LoginSchema>;

const AddFacultySchema = z.object({
    name: z.string().min(1, 'Faculty name is required.'),
    faculty_id: z.string().min(1, 'Faculty ID is required.'),
});
type AddFacultyType = z.infer<typeof AddFacultySchema>;

const UpdateKeySchema = z.object({
    newSecureKey: z.string().min(8, 'New key must be at least 8 characters.'),
});
type UpdateKeyType = z.infer<typeof UpdateKeySchema>;


export default function FacultyView() {
  const [isPending, startTransition] = useTransition();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [facultyData, setFacultyData] = useState<AuthorizedFaculty[]>([]);
  const [secureKey, setSecureKey] = useState('');
  const { toast } = useToast();

  const loginForm = useForm<LoginType>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { facultyId: '', secureKey: '' },
  });

  const addFacultyForm = useForm<AddFacultyType>({
      resolver: zodResolver(AddFacultySchema),
      defaultValues: { name: '', faculty_id: '' }
  });

  const updateKeyForm = useForm<UpdateKeyType>({
      resolver: zodResolver(UpdateKeySchema),
      defaultValues: { newSecureKey: '' }
  })

  const fetchFacultyData = useCallback(() => {
      startTransition(async () => {
        const result = await getFacultyAuthDataAction();
        if(result.success && result.data){
            setFacultyData(result.data.authorized_faculty);
            setSecureKey(result.data.secure_key);
            // Pre-fill the update key form for convenience
            updateKeyForm.setValue('newSecureKey', result.data.secure_key || '');
        } else {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: result.error || 'Could not load faculty data.',
            });
        }
      });
  }, [toast, updateKeyForm]);

  const onLoginSubmit: SubmitHandler<LoginType> = (data) => {
    startTransition(async () => {
      const result = await validateFacultyAction(data.facultyId, data.secureKey);
      if(result.isValid){
        setIsAuthorized(true);
        fetchFacultyData();
        toast({
          title: 'Validation Successful',
          description: 'Editing mode has been unlocked.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Validation Failed',
          description: result.error || 'The provided credentials are incorrect.',
        });
      }
    });
  };

  const onAddFacultySubmit: SubmitHandler<AddFacultyType> = (data) => {
    startTransition(async () => {
        const result = await addFacultyAction(data);
        if(result.success){
            toast({ title: "Success", description: "Faculty member added."});
            addFacultyForm.reset();
            fetchFacultyData(); // Refresh the list
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    });
  }

  const handleDeleteFaculty = (facultyId: string) => {
      startTransition(async () => {
          const result = await deleteFacultyAction(facultyId);
           if(result.success){
            toast({ title: "Success", description: "Faculty member removed."});
            fetchFacultyData(); // Refresh the list
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
      })
  }
  
  const onUpdateKeySubmit: SubmitHandler<UpdateKeyType> = (data) => {
      startTransition(async () => {
          const result = await updateSecureKeyAction(data.newSecureKey);
           if(result.success){
            toast({ title: "Success", description: "Secure key has been updated."});
            fetchFacultyData(); // Refresh data
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
      });
  }

  const handleLock = () => {
      setIsAuthorized(false);
      setFacultyData([]);
      setSecureKey('');
      loginForm.reset();
      addFacultyForm.reset();
      updateKeyForm.reset();
      toast({
          title: 'Locked',
          description: 'The faculty management tool is now locked.',
      });
  }


  if (!isAuthorized) {
    return (
       <Card className="border-0 shadow-none">
        <CardHeader className="p-0 mb-4 text-center">
            <CardTitle>Faculty Tools</CardTitle>
            <CardDescription>
            Enter credentials to manage the faculty list.
            </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
            <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <FormField
                    control={loginForm.control}
                    name="facultyId"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="sr-only">Faculty ID</FormLabel>
                        <FormControl>
                        <Input
                            placeholder="Enter your Faculty ID"
                            {...field}
                            disabled={isPending}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={loginForm.control}
                    name="secureKey"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="sr-only">Secure Key</FormLabel>
                        <FormControl>
                        <Input
                            type="password"
                            placeholder="Enter the secure key"
                            {...field}
                            disabled={isPending}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="animate-spin" /> : <Unlock/>}
                    Validate & Unlock
                </Button>
            </form>
            </Form>
        </CardContent>
       </Card>
    )
  }

  return (
    <div className="w-full mx-auto space-y-6">
        <div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Add New Faculty</CardTitle>
                </CardHeader>
                <CardContent>
                     <Form {...addFacultyForm}>
                        <form onSubmit={addFacultyForm.handleSubmit(onAddFacultySubmit)} className="flex flex-col sm:flex-row items-start gap-4">
                            <FormField control={addFacultyForm.control} name="name" render={({ field }) => (
                                <FormItem className="flex-1 w-full">
                                    <FormLabel>Full Name</FormLabel>
                                    <FormControl><Input placeholder="e.g., Jane Doe" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={addFacultyForm.control} name="faculty_id" render={({ field }) => (
                                <FormItem className="flex-1 w-full">
                                    <FormLabel>Faculty ID</FormLabel>
                                    <FormControl><Input placeholder="e.g., F12345" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                             <div className="self-end pt-1">
                                <Button type="submit" disabled={isPending} className="w-full sm:w-auto mt-4">
                                    {isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Add Faculty
                                </Button>
                             </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>

        <Separator />

        <div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Authorized Faculty List</CardTitle>
                    <CardDescription>
                        {isPending && !facultyData.length ? 'Loading...' : `Found ${facultyData.length} faculty member(s).`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {facultyData.map(faculty => (
                            <div key={faculty.faculty_id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                <div>
                                    <p className="font-medium">{faculty.name}</p>
                                    <p className="text-sm text-muted-foreground">{faculty.faculty_id}</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteFaculty(faculty.faculty_id)} disabled={isPending}>
                                    <Trash2 className="text-destructive h-4 w-4"/>
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
        
         <Separator />

        <div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Manage Secure Key</CardTitle>
                </CardHeader>
                <CardContent>
                     <Form {...updateKeyForm}>
                        <form onSubmit={updateKeyForm.handleSubmit(onUpdateKeySubmit)} className="flex items-start gap-4">
                            <FormField control={updateKeyForm.control} name="newSecureKey" render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>Secure Key</FormLabel>
                                    <FormControl><Input type="password" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <div className="self-end pt-1">
                                <Button type="submit" disabled={isPending} className="mt-4">
                                    {isPending ? <Loader2 className="animate-spin" /> : <Save />} Update Key
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>


        <Button variant="destructive" onClick={handleLock} className="w-full">
            <Lock/> Lock Tools
        </Button>
    </div>
  );
}
