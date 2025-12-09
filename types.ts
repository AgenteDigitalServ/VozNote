export enum AppView {
  LIST = 'LIST',
  RECORD = 'RECORD',
  EDIT = 'EDIT',
}

export interface Note {
  id: string;
  title: string;
  date: string;
  durationFormatted: string;
  transcription: string;
  summary: string;
  tags: string[];
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  TRANSCRIBING = 'TRANSCRIBING',
  SUMMARIZING = 'SUMMARIZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number; // in seconds
}