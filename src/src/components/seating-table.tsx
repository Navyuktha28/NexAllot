"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { SeatingAssignment } from "@/lib/types";

export function SeatingTable({ data }: { data: SeatingAssignment[] }) {
    if (!data || data.length === 0) {
        return <p>No seating data available.</p>
    }
    
    const headers = Object.keys(data[0]);

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {headers.map(header => (
                            <TableHead key={header} className="capitalize">{header.replace(/([A-Z])/g, ' $1')}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, index) => (
                        <TableRow key={index}>
                            {headers.map(header => (
                                <TableCell key={header}>{row[header as keyof SeatingAssignment]}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
