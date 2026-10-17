export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  isMandatory: boolean;
  sizeBytes: number;
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
}

export interface UpdaterConfig {
  autoCheck: boolean;
  autoDownload: boolean;
  channel: 'stable' | 'beta' | 'alpha';
}
