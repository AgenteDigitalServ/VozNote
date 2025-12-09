import React, { useState, useEffect, useRef } from 'react';
import { Plus, Mic, ArrowLeft, Save, Share2, FileText, Trash2, StopCircle, Loader2, Edit2, Tag, X, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import { AppView, Note, ProcessingStatus } from './types';
import { transcribeAudio, summarizeText } from './services/ai';
import { Button } from './components/Button';
import { NoteCard } from './components/NoteCard';

// Custom Logo Component mimicking the attached "Agente Digital" design
const Logo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22d3ee" /> {/* cyan-400 */}
        <stop offset="100%" stopColor="#3b82f6" /> {/* blue-500 */}
      </linearGradient>
    </defs>
    
    {/* Outer Tech Ring */}
    <circle cx="50" cy="50" r="45" stroke="url(#logoGradient)" strokeWidth="2" strokeOpacity="0.3" />
    <path d="M 50 5 A 45 45 0 0 1 95 50" stroke="url(#logoGradient)" strokeWidth="3" strokeLinecap="round" />
    <path d="M 50 95 A 45 45 0 0 1 5 50" stroke="url(#logoGradient)" strokeWidth="3" strokeLinecap="round" />
    
    {/* Decorative Notches */}
    <rect x="48" y="2" width="4" height="6" fill="#22d3ee" />
    <rect x="48" y="92" width="4" height="6" fill="#3b82f6" />
    <rect x="2" y="48" width="6" height="4" fill="#22d3ee" />
    <rect x="92" y="48" width="6" height="4" fill="#3b82f6" />

    {/* "AD" Monogram - Stylized */}
    <path 
      d="M 35 70 L 50 30 L 65 70 M 40 58 L 60 58" 
      stroke="url(#logoGradient)" 
      strokeWidth="6" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      fill="none" 
      transform="translate(-5, 0)"
    />
    <path 
        d="M 55 30 L 55 70 C 80 70 80 30 55 30" 
        stroke="url(#logoGradient)" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
        strokeOpacity="0.8"
    />
  </svg>
);

const App: React.FC = () => {
  // State
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  
  // Tag State
  const [tagInput, setTagInput] = useState('');
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>(''); // Store the detected MIME type

  // Load notes on mount
  useEffect(() => {
    const saved = localStorage.getItem('voznotes');
    if (saved) {
      try {
        setNotes(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse notes", e);
      }
    }
  }, []);

  // Save notes on update
  useEffect(() => {
    localStorage.setItem('voznotes', JSON.stringify(notes));
  }, [notes]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Helper: Detect Supported MIME Type ---
  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ''; // Let the browser choose default if none match
  };

  // --- Actions ---

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      // Initialize MediaRecorder with the detected supported mimeType (if found)
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      setView(AppView.RECORD);

      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1;
          // Safeguard: Warn user at 60 minutes
          if (next === 3600) {
            setTimeout(() => {
              alert("⚠️ Aviso de Duração\n\nA gravação atingiu 60 minutos. Para garantir o melhor processamento e evitar erros, sugerimos parar agora e iniciar uma nova parte para continuar.");
            }, 0);
          }
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      mediaRecorderRef.current.onstop = async () => {
        // Use the same MIME type used during recording creation to ensure Blob validity
        const type = mimeTypeRef.current || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type });
        
        // Stop all tracks to release mic
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());

        await processAudio(audioBlob);
      };
    }
  };

  const processAudio = async (blob: Blob) => {
    setProcessingStatus(ProcessingStatus.TRANSCRIBING);
    try {
      // Check if API key is present before starting
      if (!process.env.API_KEY) {
        throw new Error("API_KEY não encontrada. Verifique as configurações na Vercel.");
      }

      const transcription = await transcribeAudio(blob);
      
      setProcessingStatus(ProcessingStatus.SUMMARIZING);
      const summary = await summarizeText(transcription);
      
      setProcessingStatus(ProcessingStatus.COMPLETED);

      // Create a new draft note
      const newNote: Note = {
        id: Date.now().toString(),
        title: `Gravação ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        date: new Date().toLocaleDateString('pt-BR'),
        durationFormatted: formatTime(recordingDuration),
        transcription: transcription,
        summary: summary,
        tags: []
      };
      
      setActiveNote(newNote);
      setView(AppView.EDIT);
      
    } catch (error: any) {
      console.error("Process Audio Error:", error);
      setProcessingStatus(ProcessingStatus.ERROR);
      
      // More specific error message for the user
      const msg = error?.message || "Ocorreu um erro desconhecido";
      alert(`Erro no processamento: ${msg}\n\nTente gravar um áudio mais curto ou verifique sua conexão.`);
      
      setView(AppView.LIST);
    } finally {
      setProcessingStatus(ProcessingStatus.IDLE);
    }
  };

  const saveNote = () => {
    if (!activeNote) return;
    
    setNotes(prev => {
      const exists = prev.find(n => n.id === activeNote.id);
      if (exists) {
        return prev.map(n => n.id === activeNote.id ? activeNote : n);
      }
      return [activeNote, ...prev];
    });
    setView(AppView.LIST);
  };

  const deleteNote = () => {
    if (!activeNote) return;
    if (confirm("Tem certeza que deseja excluir esta gravação?")) {
      setNotes(prev => prev.filter(n => n.id !== activeNote.id));
      setView(AppView.LIST);
    }
  };

  const exportPDF = () => {
    if (!activeNote) return;
    
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    
    let yPosition = 20;

    // Header
    doc.setFontSize(22);
    doc.text(activeNote.title, margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Data: ${activeNote.date} | Duração: ${activeNote.durationFormatted}`, margin, yPosition);
    yPosition += 15;

    // Summary Section
    if (activeNote.summary) {
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Resumo Executivo", margin, yPosition);
      yPosition += 8;
      
      doc.setFontSize(11);
      const summaryLines = doc.splitTextToSize(activeNote.summary.replace(/[#*]/g, ''), contentWidth);
      doc.text(summaryLines, margin, yPosition);
      yPosition += (summaryLines.length * 7) + 10;
    }

    // Transcription Section
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.text("Transcrição Completa", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setTextColor(50);
    const transLines = doc.splitTextToSize(activeNote.transcription, contentWidth);
    
    // Simple pagination handling
    transLines.forEach((line: string) => {
        if (yPosition > 280) {
            doc.addPage();
            yPosition = 20;
        }
        doc.text(line, margin, yPosition);
        yPosition += 5;
    });

    doc.save(`${activeNote.title.replace(/\s+/g, '_')}.pdf`);
  };

  const shareNote = async () => {
    if (!activeNote) return;
    const textToShare = `${activeNote.title}\n\nRESUMO:\n${activeNote.summary}\n\nTRANSCRICÃO:\n${activeNote.transcription}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: activeNote.title,
          text: textToShare,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      await navigator.clipboard.writeText(textToShare);
      alert("Texto copiado para a área de transferência!");
    }
  };

  const addTag = () => {
    if (!activeNote || !tagInput.trim()) return;
    const currentTags = activeNote.tags || [];
    const newTag = tagInput.trim();
    
    if (!currentTags.includes(newTag)) {
      setActiveNote({
        ...activeNote,
        tags: [...currentTags, newTag]
      });
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    if (!activeNote) return;
    setActiveNote({
      ...activeNote,
      tags: (activeNote.tags || []).filter(t => t !== tagToRemove)
    });
  };

  // --- Views ---

  if (view === AppView.RECORD) {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-white relative">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8">
            
            {processingStatus !== ProcessingStatus.IDLE ? (
               <div className="space-y-6">
                 <Loader2 className="w-16 h-16 animate-spin text-blue-400 mx-auto" />
                 <div>
                   <h2 className="text-2xl font-bold mb-2">Processando...</h2>
                   <p className="text-slate-400">
                      {processingStatus === ProcessingStatus.TRANSCRIBING && "Transcrevendo áudio..."}
                      {processingStatus === ProcessingStatus.SUMMARIZING && "Gerando resumo inteligente..."}
                   </p>
                 </div>
               </div>
            ) : (
              <>
                <div className="w-48 h-48 rounded-full bg-red-500/10 flex items-center justify-center animate-pulse shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                    <Mic className="w-16 h-16 text-white" />
                  </div>
                </div>
                
                <div>
                  <h2 className="text-6xl font-mono font-bold tracking-wider mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-200">
                    {formatTime(recordingDuration)}
                  </h2>
                  <p className="text-slate-500 font-medium tracking-widest uppercase text-xs">Gravando Áudio</p>
                </div>
              </>
            )}
        </div>

        {processingStatus === ProcessingStatus.IDLE && (
          <div className="p-8 pb-12 bg-slate-900/80 backdrop-blur-lg rounded-t-[3rem] border-t border-slate-800">
             <Button 
                variant="danger" 
                className="w-full text-lg h-16 rounded-2xl shadow-red-500/20 shadow-xl"
                onClick={stopRecording}
              >
                <StopCircle className="w-6 h-6" /> Parar e Processar
              </Button>
          </div>
        )}
      </div>
    );
  }

  if (view === AppView.EDIT && activeNote) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button 
            onClick={() => setView(AppView.LIST)} 
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <div className="flex-1">
             <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 border border-transparent focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white transition-all">
                <input 
                  value={activeNote.title}
                  onChange={(e) => setActiveNote({...activeNote, title: e.target.value})}
                  className="flex-1 font-semibold text-gray-900 bg-transparent outline-none placeholder-gray-400"
                  placeholder="Nome do arquivo..."
                />
                <Edit2 className="w-4 h-4 text-gray-400" />
             </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Tags Section */}
          <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-gray-500">
              <Tag className="w-4 h-4" />
              <h3 className="font-bold uppercase text-xs tracking-wide">Tags</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {(activeNote.tags || []).map(tag => (
                <span key={tag} className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                  {tag}
                  <button 
                    onClick={() => removeTag(tag)}
                    className="hover:text-blue-900 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              
              <input 
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder={(activeNote.tags || []).length === 0 ? "Adicionar tag..." : "Adicionar..."}
                className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-1 px-2 text-gray-700 placeholder-gray-400"
              />
            </div>
          </section>

          {/* Summary Section */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100">
            <div className="flex items-center gap-2 mb-3 text-blue-700">
              <FileText className="w-5 h-5" />
              <h3 className="font-bold uppercase text-sm tracking-wide">Resumo Automático</h3>
            </div>
            <textarea 
               value={activeNote.summary}
               onChange={(e) => setActiveNote({...activeNote, summary: e.target.value})}
               className="w-full h-48 text-gray-700 text-base leading-relaxed outline-none resize-none bg-transparent"
               placeholder="O resumo aparecerá aqui..."
            />
          </section>

          {/* Transcription Section */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wide mb-3">Transcrição Completa</h3>
            <textarea 
               value={activeNote.transcription}
               onChange={(e) => setActiveNote({...activeNote, transcription: e.target.value})}
               className="w-full h-96 text-gray-600 text-sm leading-relaxed outline-none resize-none bg-transparent"
            />
          </section>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 p-4 safe-area-bottom">
           <div className="flex gap-2 mb-3">
              <Button variant="secondary" className="flex-1 text-sm" onClick={exportPDF}>
                <FileText className="w-4 h-4" /> PDF
              </Button>
              <Button variant="secondary" className="flex-1 text-sm" onClick={shareNote}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
              <Button variant="secondary" className="bg-red-50 text-red-600 border-red-100" onClick={deleteNote}>
                <Trash2 className="w-4 h-4" />
              </Button>
           </div>
           <Button className="w-full" onClick={saveNote}>
             <Save className="w-5 h-5" /> Salvar Documento
           </Button>
        </div>
      </div>
    );
  }

  // Default: LIST View (Modified for Dark Mode)
  return (
    <div className="flex flex-col h-full bg-slate-950">
      <header className="bg-slate-950/80 backdrop-blur-md px-6 py-6 sticky top-0 z-10 border-b border-slate-900">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-cyan-500 fill-cyan-500/20" />
                    VozNote AI
                </h1>
                <p className="text-slate-400 text-sm mt-1 font-medium">{notes.length} gravações salvas</p>
            </div>
            
            {/* Logo Placeholder / Replacement */}
            <div className="relative group">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <Logo className="w-14 h-14 relative z-10" />
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
             <div className="bg-slate-900 border border-slate-800 p-8 rounded-full mb-6 shadow-2xl shadow-blue-900/10">
               <Mic className="w-10 h-10 text-slate-600" />
             </div>
             <h2 className="text-white text-xl font-semibold mb-2">Sem gravações</h2>
             <p className="text-slate-400 max-w-xs leading-relaxed">Toque no botão abaixo para começar a capturar suas reuniões com IA.</p>
          </div>
        ) : (
          notes.map(note => (
            <NoteCard 
              key={note.id} 
              note={note} 
              onClick={() => {
                setActiveNote(note);
                setView(AppView.EDIT);
              }} 
            />
          ))
        )}
      </div>

      <div className="absolute bottom-8 right-6">
        <button 
          onClick={startRecording}
          className="group w-16 h-16 bg-gradient-to-tr from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl shadow-xl shadow-cyan-600/30 flex items-center justify-center transition-all duration-300 hover:scale-105 hover:-translate-y-1 active:scale-95 border border-white/10"
        >
          <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>
    </div>
  );
};

export default App;