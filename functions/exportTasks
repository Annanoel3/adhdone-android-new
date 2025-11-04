import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const tasks = await base44.entities.Task.filter({});
        const doc = new jsPDF();
        
        // Title and headers
        doc.setFontSize(20);
        doc.text('Tasks Report', 20, 20);
        
        doc.setFontSize(14); // Changed from 10 to 14
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 30);
        
        // Table headers
        doc.setFontSize(12);
        doc.text('Task', 20, 45);
        doc.text('Status', 100, 45);
        doc.text('Priority', 140, 45);
        
        // Task content
        let y = 55;
        tasks.forEach((task) => {
            if (y > 270) { // New page if needed
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14); // Changed from 10 to 14
            doc.text(task.title, 20, y);
            doc.text(task.status, 100, y);
            doc.text(task.priority || 'normal', 140, y);
            y += 10;
        });

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename=tasks.pdf'
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});