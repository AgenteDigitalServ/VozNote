
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Mic, ArrowLeft, Save, FileText, Trash2, StopCircle, 
  Loader2, Tag, X, Sparkles, Search, Copy, Check, Clock 
} from 'lucide-react';
import jsPDF from 'jspdf';
import { AppView, Note, ProcessingStatus } from './types';
import { transcribeAudio, summarizeText } from './services/ai';
import { Button } from './components/Button';
import { NoteCard } from './components/NoteCard';
import { Waveform } from './components/Waveform';

const Logo = () => (
  <div className="flex items-center gap-2">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
      <Mic className="w-6 h-6 text-white" />
    </div>
    <span className="text-xl font-black tracking-tighter text-white">VozNote<span className="text-cyan-500">AI</span></span>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('voznote_data');
    if (saved) setNotes(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('voznote_data', JSON.stringify(notes));
  }, [notes]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      setView(AppView.RECORD);

      timerRef.current = window.setInterval(() => {
        setRecordingDuration(p => p + 1);
      }, 1000);
    } catch (err) {
      alert("Permissão de microfone necessária.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        await processAudio(audioBlob);
      };
    }
  };

  const processAudio = async (blob: Blob) => {
    setProcessingStatus(ProcessingStatus.TRANSCRIBING);
    try {
      const transcription = await transcribeAudio(blob);
      setProcessingStatus(ProcessingStatus.SUMMARIZING);
      const summary = await summarizeText(transcription);
      
      const newNote: Note = {
        id: Date.now().toString(),
        title: `Nota de ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        date: new Date().toLocaleDateString('pt-BR'),
        durationFormatted: formatTime(recordingDuration),
        transcription,
        summary,
        tags: []
      };
      
      setActiveNote(newNote);
      setView(AppView.EDIT);
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
      setView(AppView.LIST);
    } finally {
      setProcessingStatus(ProcessingStatus.IDLE);
    }
  };

  const saveNote = () => {
    if (!activeNote) return;
    setNotes(prev => {
      const exists = prev.find(n => n.id === activeNote.id);
      if (exists) return prev.map(n => n.id === activeNote.id ? activeNote : n);
      return [activeNote, ...prev];
    });
    setView(AppView.LIST);
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const exportPDF = () => {
    if (!activeNote) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(activeNote.title, 20, 20);
    doc.setFontSize(10);
    doc.text(`${activeNote.date} | ${activeNote.durationFormatted}`, 20, 30);
    doc.setFontSize(12);
    const splitSummary = doc.splitTextToSize(activeNote.summary, 170);
    doc.text(splitSummary, 20, 45);
    doc.save(`${activeNote.title}.pdf`);
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (view === AppView.RECORD) {
    return (
      <div className="h-full bg-slate-950 flex flex-col items-center justify-between p-8 text-center">
        <div className="w-full flex justify-center pt-10">
          <Logo />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-12 w-full">
          {processingStatus !== ProcessingStatus.IDLE ? (
            <div className="animate-pulse flex flex-col items-center gap-4">
              <Loader2 className="w-16 h-16 text-cyan-500 animate-spin" />
              <p className="text-cyan-400 font-bold tracking-widest uppercase text-xs">
                {processingStatus === ProcessingStatus.TRANSCRIBING ? "Transcrevendo Áudio..." : "Gerando Resumo..."}
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full animate-pulse" />
                <div className="w-48 h-48 rounded-full bg-slate-900 border-4 border-red-500/30 flex items-center justify-center relative z-10">
                  <Mic className="w-16 h-16 text-red-500 animate-bounce" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-6xl font-mono font-bold text-white tracking-tighter">
                  {formatTime(recordingDuration)}
                </span>
                <Waveform isRecording={isRecording} />
              </div>
            </>
          )}
        </div>

        {processingStatus === ProcessingStatus.IDLE && (
          <button 
            onClick={stopRecording}
            className="w-full h-16 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-red-900/20"
          >
            <StopCircle className="w-6 h-6" /> Parar e Processar
          </button>
        )}
      </div>
    );
  }

  if (view === AppView.EDIT && activeNote) {
    return (
      <div className="h-full bg-slate-950 flex flex-col">
        <header className="p-4 flex items-center gap-4 border-b border-slate-900">
          <button onClick={() => setView(AppView.LIST)} className="p-2 text-slate-400 hover:text-white">
            <ArrowLeft />
          </button>
          <input 
            value={activeNote.title}
            onChange={e => setActiveNote({...activeNote, title: e.target.value})}
            className="flex-1 bg-transparent border-none text-lg font-bold outline-none text-white"
          />
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
          <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-cyan-500 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Resumo Executivo
              </h3>
              <button onClick={() => copyToClipboard(activeNote.summary, 's')} className="text-slate-500 hover:text-white">
                {copiedSection === 's' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea 
              value={activeNote.summary}
              onChange={e => setActiveNote({...activeNote, summary: e.target.value})}
              className="w-full h-48 bg-transparent text-slate-200 leading-relaxed outline-none resize-none"
            />
          </div>

          <div className="bg-slate-900/30 p-5 rounded-3xl border border-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest">Transcrição</h3>
              <button onClick={() => copyToClipboard(activeNote.transcription, 't')} className="text-slate-500 hover:text-white">
                {copiedSection === 't' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea 
              value={activeNote.transcription}
              onChange={e => setActiveNote({...activeNote, transcription: e.target.value})}
              className="w-full h-64 bg-transparent text-slate-400 text-sm leading-relaxed outline-none resize-none"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-900 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={exportPDF} className="bg-slate-900 border-slate-800">
            <FileText className="w-4 h-4" /> Exportar PDF
          </Button>
          <Button variant="primary" onClick={saveNote} className="bg-blue-600">
            <Save className="w-4 h-4" /> Salvar Nota
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 flex flex-col overflow-hidden">
      <header className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Logo />
          <div className="p-2 bg-slate-900 rounded-full text-slate-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-cyan-500 transition-colors" />
          <input 
            placeholder="Pesquisar reuniões..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-cyan-500/50 outline-none transition-all"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-32">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center gap-4">
            <div className="p-6 bg-slate-900 rounded-full">
              <Mic className="w-10 h-10" />
            </div>
            <p>Nenhuma gravação encontrada.<br/>Toque no botão abaixo para começar.</p>
          </div>
        ) : (
          filteredNotes.map(note => (
            <NoteCard key={note.id} note={note} onClick={() => { setActiveNote(note); setView(AppView.EDIT); }} />
          ))
        )}
      </div>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <button 
          onClick={startRecording}
          className="h-16 px-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full shadow-2xl shadow-cyan-500/20 flex items-center gap-3 font-bold text-white active:scale-95 transition-all"
        >
          <Plus className="w-6 h-6" /> Gravar Agora
        </button>
      </div>
    </div>
  );
};

export default App;
