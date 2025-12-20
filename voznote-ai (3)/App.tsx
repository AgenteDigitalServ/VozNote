
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Mic, ArrowLeft, Save, FileText, Trash2, StopCircle, 
  Loader2, Tag, X, Sparkles, Search, Copy, Check, Clock, Download, Play, Pause,
  Settings, History, Info
} from 'lucide-react';
import jsPDF from 'jspdf';
import { AppView, Note, ProcessingStatus } from './types';
import { transcribeAudio, summarizeText } from './services/ai';
import { Button } from './components/Button';
import { NoteCard } from './components/NoteCard';
import { Waveform } from './components/Waveform';

const Logo = () => (
  <div className="flex items-center gap-3">
    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
      <Mic className="w-6 h-6 text-white" />
    </div>
    <div className="flex flex-col -space-y-1">
      <span className="text-xl font-black tracking-tighter text-white">VozNote<span className="text-cyan-400">AI</span></span>
      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Intelligent Audio</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('voznote_data');
    if (saved) {
      try {
        setNotes(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar dados", e);
      }
    }
  }, []);

  useEffect(() => {
    const notesToSave = notes.map(({ audioUrl, ...rest }) => rest);
    localStorage.setItem('voznote_data', JSON.stringify(notesToSave));
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
      alert("Permissão de microfone necessária. Verifique as configurações do seu smartphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        await processAudio(audioBlob, audioUrl);
      };
    }
  };

  const processAudio = async (blob: Blob, audioUrl: string) => {
    setProcessingStatus(ProcessingStatus.TRANSCRIBING);
    try {
      const transcription = await transcribeAudio(blob);
      setProcessingStatus(ProcessingStatus.SUMMARIZING);
      const summary = await summarizeText(transcription);
      
      const newNote: Note = {
        id: Date.now().toString(),
        title: `Nota ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        date: new Date().toLocaleDateString('pt-BR'),
        durationFormatted: formatTime(recordingDuration),
        transcription,
        summary,
        tags: [],
        audioUrl
      };
      
      setActiveNote(newNote);
      setView(AppView.EDIT);
    } catch (error: any) {
      alert(`Erro no processamento: ${error.message}`);
      setView(AppView.LIST);
    } finally {
      setProcessingStatus(ProcessingStatus.IDLE);
    }
  };

  const downloadAudio = () => {
    if (!activeNote?.audioUrl) return;
    const link = document.createElement('a');
    link.href = activeNote.audioUrl;
    link.download = `${activeNote.title.replace(/\s+/g, '_')}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteNote = (id: string) => {
    if (confirm("Deseja realmente excluir esta nota?")) {
      setNotes(prev => prev.filter(n => n.id !== id));
      setView(AppView.LIST);
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

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const exportPDF = () => {
    if (!activeNote) return;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(2, 6, 23);
    doc.text(activeNote.title, 20, 25);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Data: ${activeNote.date} | Duração: ${activeNote.durationFormatted}`, 20, 32);
    doc.setDrawColor(200);
    doc.line(20, 38, 190, 38);
    doc.setFontSize(14);
    doc.setTextColor(2, 6, 23);
    doc.text("Resumo Executivo", 20, 50);
    doc.setFontSize(11);
    doc.setTextColor(60);
    const splitSummary = doc.splitTextToSize(activeNote.summary, 170);
    doc.text(splitSummary, 20, 60);
    doc.save(`${activeNote.title}.pdf`);
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (view === AppView.RECORD) {
    return (
      <div className="h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center safe-top safe-bottom">
        <div className="w-full max-w-md flex flex-col items-center gap-10">
          {processingStatus !== ProcessingStatus.IDLE ? (
            <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500">
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full animate-pulse" />
                <Loader2 className="w-24 h-24 text-cyan-400 animate-spin relative z-10" />
              </div>
              <div className="space-y-4">
                <p className="text-3xl font-black text-white tracking-tight drop-shadow-md">Processando...</p>
                <div className="bg-slate-900/50 px-6 py-2 rounded-full border border-cyan-500/20">
                  <p className="text-cyan-400 font-bold tracking-[0.15em] uppercase text-xs">
                    {processingStatus === ProcessingStatus.TRANSCRIBING ? "IA Transcrevendo Áudio" : "Gerando Resumo Inteligente"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                {/* Efeito de Ondas de Pulso */}
                <div className="absolute inset-0 bg-red-500/10 blur-3xl rounded-full animate-pulse scale-[1.8]" />
                <div className="absolute inset-0 bg-red-500/5 blur-2xl rounded-full animate-pulse delay-150 scale-[1.4]" />
                
                <div className="w-64 h-64 rounded-full bg-slate-900/30 backdrop-blur-3xl border-[6px] border-red-500/10 flex items-center justify-center relative z-10 overflow-hidden shadow-[0_0_80px_rgba(239,68,68,0.15)]">
                   <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent"></div>
                   {/* Animação de círculo externo pulsante */}
                   <div className="absolute w-full h-full border-2 border-red-500/30 rounded-full animate-ping opacity-20"></div>
                   <Mic className="w-24 h-24 text-red-500 relative z-10 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                </div>
              </div>

              <div className="flex flex-col items-center gap-8 w-full">
                <div className="space-y-2">
                  <span className="text-8xl font-mono font-black text-white tracking-tighter tabular-nums drop-shadow-2xl block">
                    {formatTime(recordingDuration)}
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <p className="text-red-500 font-black uppercase tracking-[0.4em] text-[10px] opacity-80">Gravando Agora</p>
                  </div>
                </div>
                
                <div className="w-full max-w-[300px] h-20 bg-slate-900/20 rounded-2xl p-2 border border-white/5">
                  <Waveform isRecording={isRecording} />
                </div>

                <button 
                  onClick={stopRecording}
                  className="mt-6 w-full h-20 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white rounded-[28px] font-black text-xl flex items-center justify-center gap-4 transition-all shadow-2xl shadow-red-900/50 active:scale-95 group"
                >
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <StopCircle className="w-7 h-7" />
                  </div>
                  Parar Gravação
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === AppView.EDIT && activeNote) {
    return (
      <div className="h-full bg-slate-950 flex flex-col safe-top safe-bottom">
        <header className="px-4 py-6 flex items-center gap-4 border-b border-slate-900/50 backdrop-blur-md sticky top-0 z-50">
          <button onClick={() => setView(AppView.LIST)} className="p-3 bg-slate-900 rounded-xl text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input 
            value={activeNote.title}
            onChange={e => setActiveNote({...activeNote, title: e.target.value})}
            className="flex-1 bg-transparent border-none text-xl font-black outline-none text-white focus:ring-2 focus:ring-cyan-500/10 rounded-lg px-2"
          />
          <button onClick={() => deleteNote(activeNote.id)} className="p-3 text-slate-600 hover:text-red-500 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-40 scrollbar-hide">
          {activeNote.audioUrl && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-3xl flex items-center gap-5 shadow-inner">
              <button 
                onClick={togglePlayback}
                className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 transition-all active:scale-90"
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 fill-current ml-1" />}
              </button>
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Preview de Voz</div>
                <div className="text-base font-bold text-slate-100">{activeNote.durationFormatted}</div>
              </div>
              <button 
                onClick={downloadAudio}
                className="p-4 bg-slate-800/50 rounded-2xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-all"
                title="Salvar áudio localmente"
              >
                <Download className="w-6 h-6" />
              </button>
              <audio 
                ref={audioRef} 
                src={activeNote.audioUrl} 
                onEnded={() => setIsPlaying(false)}
                hidden 
              />
            </div>
          )}

          <div className="bg-slate-900/40 backdrop-blur-sm p-6 rounded-[32px] border border-slate-800/50 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <h3 className="text-slate-100 text-sm font-bold">Resumo da Inteligência Artificial</h3>
              </div>
              <button onClick={() => copyToClipboard(activeNote.summary, 's')} className="text-slate-500 hover:text-white p-2 bg-slate-800/30 rounded-lg">
                {copiedSection === 's' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea 
              value={activeNote.summary}
              onChange={e => setActiveNote({...activeNote, summary: e.target.value})}
              className="w-full h-56 bg-transparent text-slate-300 leading-relaxed outline-none resize-none text-sm font-medium scrollbar-hide"
            />
          </div>

          <div className="bg-slate-900/20 p-6 rounded-[32px] border border-slate-900 space-y-5">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <h3 className="text-slate-400 text-sm font-bold">Transcrição Completa</h3>
              </div>
              <button onClick={() => copyToClipboard(activeNote.transcription, 't')} className="text-slate-500 hover:text-white p-2">
                {copiedSection === 't' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea 
              value={activeNote.transcription}
              onChange={e => setActiveNote({...activeNote, transcription: e.target.value})}
              className="w-full h-80 bg-transparent text-slate-500 text-xs leading-relaxed outline-none resize-none italic"
            />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent flex gap-3 safe-bottom z-50">
          <Button variant="secondary" onClick={exportPDF} className="flex-1 bg-slate-900 border-slate-800 py-4.5 rounded-2xl text-white">
            <FileText className="w-5 h-5" /> Exportar PDF
          </Button>
          <Button variant="primary" onClick={saveNote} className="flex-[1.5] bg-blue-600 py-4.5 rounded-2xl shadow-xl shadow-blue-500/20">
            <Save className="w-5 h-5" /> Salvar Nota
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 flex flex-col overflow-hidden safe-top safe-bottom">
      <header className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Logo />
          <div className="flex items-center gap-3">
             <button className="p-3 bg-slate-900/50 rounded-2xl text-slate-400">
               <History className="w-5 h-5" />
             </button>
             <div className="w-11 h-11 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 font-bold border border-slate-700">
               AD
             </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{notes.length} gravações salvas</p>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-cyan-500 transition-colors" />
            <input 
              placeholder="Pesquisar reuniões, ideias..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/40 border border-slate-800/50 rounded-[20px] py-4.5 pl-12 pr-4 text-sm focus:border-cyan-500/30 focus:bg-slate-900/60 outline-none transition-all text-white backdrop-blur-sm"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-36 scrollbar-hide">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-slate-600 text-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full"></div>
              <div className="p-10 bg-slate-900/30 rounded-[40px] border border-slate-800/50 relative z-10">
                <Mic className="w-14 h-14 text-slate-700" />
              </div>
            </div>
            <div className="space-y-2 max-w-[240px]">
              <p className="font-bold text-slate-300 text-lg">Sem gravações</p>
              <p className="text-sm leading-relaxed text-slate-500 font-medium">Toque no botão abaixo para começar a capturar suas reuniões com IA.</p>
            </div>
          </div>
        ) : (
          filteredNotes.map(note => (
            <NoteCard key={note.id} note={note} onClick={() => { setActiveNote(note); setView(AppView.EDIT); }} />
          ))
        )}
      </div>

      <div className="fixed bottom-10 right-8 z-50">
        <button 
          onClick={startRecording}
          className="h-18 w-18 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-[24px] shadow-2xl shadow-blue-500/40 flex items-center justify-center text-white active:scale-90 transition-all hover:scale-105 active:rotate-12"
        >
          <Plus className="w-9 h-9" />
        </button>
      </div>
    </div>
  );
};

export default App;
