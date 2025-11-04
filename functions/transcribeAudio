import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

Deno.serve(async (req) => {
    console.log('🎤 transcribeAudio function called');
    
    try {
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error('❌ OPENAI_API_KEY is not set!');
            return Response.json({ 
                success: false,
                error: 'OpenAI API key not configured. Please set it in Settings.' 
            }, { status: 500 });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Get the file URL from request body
        const body = await req.json();
        const fileUrl = body.file_url;

        if (!fileUrl) {
            console.error('❌ No file_url in request');
            return Response.json({ success: false, error: 'No file_url provided' }, { status: 400 });
        }

        console.log('📁 Fetching audio file from:', fileUrl);

        // Download the audio file
        const audioResponse = await fetch(fileUrl);
        if (!audioResponse.ok) {
            throw new Error('Failed to download audio file');
        }
        
        const audioBlob = await audioResponse.blob();
        console.log('📁 Audio file downloaded:', audioBlob.size, 'bytes');

        const openai = new OpenAI({ apiKey });

        // Convert blob to File for OpenAI
        const file = new File([audioBlob], 'recording.webm', { 
            type: 'audio/webm' 
        });

        console.log('🔄 Sending to OpenAI Whisper API...');

        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            language: "en",
        });

        console.log('✅ Transcription complete:', transcription.text);

        return Response.json({ 
            transcription: transcription.text,
            success: true 
        });
    } catch (error) {
        console.error('❌ ERROR in transcribeAudio');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return Response.json({ 
            success: false,
            error: 'Transcription failed',
            details: error.message
        }, { status: 500 });
    }
});