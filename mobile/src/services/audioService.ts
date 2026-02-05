import { Audio } from 'expo-av';
import { Recording } from 'expo-av/build/Audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// Optimized VAD configuration for reliable speech recognition
const VAD_CONFIG = {
  // Audio level thresholds - more tolerant
  SILENCE_THRESHOLD: -50, // dB threshold for silence detection (more sensitive)
  SPEECH_THRESHOLD: -40, // dB threshold for definite speech

  // Timing configuration - optimized for speed
  SILENCE_DURATION_MS: 350, // Short pause before segment ends (snappy for conversation)
  SPEECH_START_DELAY_MS: 40, // Faster speech start confirmation
  MIN_SEGMENT_DURATION_MS: 250, // Allow shorter segments for quick responses
  MAX_SEGMENT_DURATION_MS: 10000, // Allow longer segments (10 seconds)
  METERING_INTERVAL_MS: 50, // 2x more responsive VAD (was 100)

  // Audio overlap for boundary word preservation
  OVERLAP_DURATION_MS: 300, // Overlap with previous segment to catch boundary words

  // Adaptive threshold
  NOISE_FLOOR_SAMPLES: 30, // More samples for better noise estimation
  NOISE_FLOOR_MARGIN_DB: 8, // dB above noise floor to detect speech
};

// Web Audio VAD config (optimized)
const WEB_VAD_CONFIG = {
  SILENCE_THRESHOLD: 0.008, // Lower threshold for better sensitivity
  SPEECH_THRESHOLD: 0.02, // Definite speech threshold
  SILENCE_DURATION_MS: 400, // Faster segmentation
  MIN_SEGMENT_DURATION_MS: 300,
  MAX_SEGMENT_DURATION_MS: 6000,
  OVERLAP_DURATION_MS: 300,
  METERING_INTERVAL_MS: 50,
};

export interface AudioSegment {
  uri: string;
  base64: string;
  durationMs: number;
  segmentId: number;
}

// ============================================================================
// WEB AUDIO SERVICE (for browser)
// ============================================================================

class WebAudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private meteringInterval: NodeJS.Timeout | null = null;
  private segmentCount: number = 0;
  private segmentStartTime: number = 0;
  private lastSpeechTime: number = 0;
  private speechStartTime: number = 0;
  private isSpeaking: boolean = false;
  private onSegmentReady?: (segment: AudioSegment) => void;
  private onMeteringUpdate?: (level: number, isSpeaking: boolean) => void;

  // Continuous audio buffer for overlap
  private audioBuffer: Blob[] = [];
  private readonly BUFFER_DURATION_MS = 500; // Keep last 500ms of audio

  // Adaptive noise floor
  private noiseSamples: number[] = [];
  private noiseFloor: number = WEB_VAD_CONFIG.SILENCE_THRESHOLD;

  // Speech state machine
  private speechState: 'silence' | 'maybe_speech' | 'speech' | 'maybe_silence' = 'silence';
  private stateChangeTime: number = 0;

  async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Web audio permission error:', error);
      return false;
    }
  }

  async startRealtimeMode(
    onSegmentReady: (segment: AudioSegment) => void,
    onMeteringUpdate?: (level: number, isSpeaking: boolean) => void
  ): Promise<boolean> {
    try {
      this.onSegmentReady = onSegmentReady;
      this.onMeteringUpdate = onMeteringUpdate;
      this.segmentCount = 0;
      this.audioBuffer = [];
      this.noiseSamples = [];
      this.noiseFloor = WEB_VAD_CONFIG.SILENCE_THRESHOLD;
      this.speechState = 'silence';

      // Get microphone stream with optimized settings for speech
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Higher sample rate for better quality
          sampleRate: 48000,
          channelCount: 1,
        }
      });

      // Create audio context for metering
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Add high-pass filter to reduce low-frequency noise
      const highPassFilter = this.audioContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 80; // Cut frequencies below 80Hz
      source.connect(highPassFilter);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512; // Higher resolution
      this.analyser.smoothingTimeConstant = 0.3; // Faster response
      highPassFilter.connect(this.analyser);

      // Start recording
      await this.startRecording();

      // Start metering with optimized interval
      this.meteringInterval = setInterval(() => {
        this.checkVoiceActivity();
      }, WEB_VAD_CONFIG.METERING_INTERVAL_MS);

      console.log('Web real-time mode started with optimized settings');
      return true;
    } catch (error) {
      console.error('Start web realtime mode error:', error);
      return false;
    }
  }

  private async startRecording(): Promise<void> {
    if (!this.mediaStream) return;

    this.audioChunks = [];
    this.segmentStartTime = Date.now();
    this.lastSpeechTime = Date.now();
    this.speechStartTime = 0;

    // Use higher bitrate for better quality
    const options: MediaRecorderOptions = {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000, // 128kbps for better quality
    };

    this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Collect data every 50ms for smoother audio
    this.mediaRecorder.start(50);
    this.isRecording = true;
  }

  private checkVoiceActivity(): void {
    if (!this.analyser || !this.isRecording) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate RMS (Root Mean Square) for more accurate level detection
    // Focus on speech frequencies (roughly 85-255 Hz mapped to bins)
    const speechBins = dataArray.slice(2, 40); // Focus on speech frequency range
    const rms = Math.sqrt(speechBins.reduce((sum, val) => sum + val * val, 0) / speechBins.length);
    const normalizedLevel = rms / 255;

    // Convert to dB-like scale for UI (-60 to 0)
    const dbLevel = normalizedLevel > 0 ? (Math.log10(normalizedLevel) * 20) : -60;

    // Update adaptive noise floor during silence
    if (this.speechState === 'silence') {
      this.noiseSamples.push(normalizedLevel);
      if (this.noiseSamples.length > 30) {
        this.noiseSamples.shift();
      }
      // Calculate noise floor as average of samples
      const avgNoise = this.noiseSamples.reduce((a, b) => a + b, 0) / this.noiseSamples.length;
      this.noiseFloor = Math.max(avgNoise * 1.5, WEB_VAD_CONFIG.SILENCE_THRESHOLD);
    }

    const now = Date.now();
    const segmentDuration = now - this.segmentStartTime;
    const isSpeechLevel = normalizedLevel > this.noiseFloor;
    const isDefiniteSpeech = normalizedLevel > WEB_VAD_CONFIG.SPEECH_THRESHOLD;

    // State machine for robust speech detection
    const prevState = this.speechState;

    switch (this.speechState) {
      case 'silence':
        if (isSpeechLevel) {
          this.speechState = 'maybe_speech';
          this.stateChangeTime = now;
        }
        break;

      case 'maybe_speech':
        if (isDefiniteSpeech || (isSpeechLevel && now - this.stateChangeTime > 50)) {
          // Confirmed speech
          this.speechState = 'speech';
          this.speechStartTime = this.stateChangeTime;
          this.lastSpeechTime = now;
        } else if (!isSpeechLevel && now - this.stateChangeTime > 100) {
          // False positive, go back to silence
          this.speechState = 'silence';
        }
        break;

      case 'speech':
        if (isSpeechLevel) {
          this.lastSpeechTime = now;
        } else {
          this.speechState = 'maybe_silence';
          this.stateChangeTime = now;
        }
        break;

      case 'maybe_silence':
        if (isSpeechLevel) {
          // Speech resumed
          this.speechState = 'speech';
          this.lastSpeechTime = now;
        } else if (now - this.stateChangeTime > WEB_VAD_CONFIG.SILENCE_DURATION_MS) {
          // Confirmed silence - end of speech
          this.speechState = 'silence';
        }
        break;
    }

    this.isSpeaking = this.speechState === 'speech' || this.speechState === 'maybe_speech';

    if (this.onMeteringUpdate) {
      this.onMeteringUpdate(dbLevel, this.isSpeaking);
    }

    // Decide whether to finalize segment
    const speechEnded = prevState === 'maybe_silence' && this.speechState === 'silence';
    const maxDurationReached = segmentDuration > WEB_VAD_CONFIG.MAX_SEGMENT_DURATION_MS;
    const hasMinDuration = segmentDuration > WEB_VAD_CONFIG.MIN_SEGMENT_DURATION_MS;
    const hadSpeech = this.speechStartTime > 0;

    if ((speechEnded && hasMinDuration && hadSpeech) || (maxDurationReached && hadSpeech)) {
      this.finalizeCurrentSegment();
    }
  }

  private async finalizeCurrentSegment(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;

    const segmentDuration = Date.now() - this.segmentStartTime;
    const recorder = this.mediaRecorder;

    // Create a promise that resolves when the recorder fully stops
    const stopPromise = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        resolve();
      };
    });

    // Stop current recording
    recorder.stop();
    this.isRecording = false;
    this.mediaRecorder = null;

    // Wait for the onstop event to ensure all data is collected
    await stopPromise;

    // Small additional delay to ensure ondataavailable has fired
    await new Promise(resolve => setTimeout(resolve, 50));

    if (this.audioChunks.length > 0 && segmentDuration >= WEB_VAD_CONFIG.MIN_SEGMENT_DURATION_MS) {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

      // Convert to base64
      const base64 = await this.blobToBase64(audioBlob);

      this.segmentCount++;

      const segment: AudioSegment = {
        uri: URL.createObjectURL(audioBlob),
        base64: base64.split(',')[1] || base64,
        durationMs: segmentDuration,
        segmentId: this.segmentCount,
      };

      console.log(`Web segment ${this.segmentCount} ready: ${segmentDuration}ms, size: ${base64.length}`);

      if (this.onSegmentReady) {
        this.onSegmentReady(segment);
      }
    }

    // Reset speech state for new segment
    this.speechState = 'silence';
    this.speechStartTime = 0;

    // Start new recording (clean start)
    if (this.mediaStream && this.mediaStream.active) {
      await this.startRecording();
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  stopRealtimeMode(): void {
    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.isRecording = false;
    this.isSpeaking = false;
    this.onSegmentReady = undefined;
    this.onMeteringUpdate = undefined;

    // Reset all state
    this.audioBuffer = [];
    this.noiseSamples = [];
    this.noiseFloor = WEB_VAD_CONFIG.SILENCE_THRESHOLD;
    this.speechState = 'silence';
    this.speechStartTime = 0;

    console.log('Web real-time mode stopped');
  }

  async cleanup(): Promise<void> {
    this.stopRealtimeMode();
  }

  isInRealtimeMode(): boolean {
    return this.isRecording;
  }
}

const webAudioService = new WebAudioService();

class AudioService {
  private recording: Recording | null = null;
  private sound: Audio.Sound | null = null;
  private isRecordingInProgress: boolean = false;

  // Real-time translation properties
  private isRealtimeMode: boolean = false;
  private meteringInterval: NodeJS.Timeout | null = null;
  private segmentCount: number = 0;
  private segmentStartTime: number = 0;
  private lastSpeechTime: number = 0;
  private isSpeaking: boolean = false;
  private onSegmentReady?: (segment: AudioSegment) => void;
  private onMeteringUpdate?: (level: number, isSpeaking: boolean) => void;

  async requestPermissions(): Promise<boolean> {
    // Use WebAudioService for web platform
    if (Platform.OS === 'web') {
      return webAudioService.requestPermissions();
    }

    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  async startRecording(): Promise<void> {
    try {
      // Önceki kaydı temizle
      if (this.recording || this.isRecordingInProgress) {
        console.log('Cleaning up previous recording...');
        await this.cleanup();
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted');
      }

      this.isRecordingInProgress = true;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
    } catch (error) {
      this.isRecordingInProgress = false;
      console.error('Start recording error:', error);
      throw error;
    }
  }

  async startRecordingWithMetering(
    onMeteringUpdate: (level: number, isSpeaking: boolean) => void
  ): Promise<void> {
    try {
      if (this.recording || this.isRecordingInProgress) {
        await this.cleanup();
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted');
      }

      this.isRecordingInProgress = true;
      this.onMeteringUpdate = onMeteringUpdate;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 48000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MAX,
            sampleRate: 48000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
          isMeteringEnabled: true,
        },
        undefined,
        100
      );

      this.recording = recording;

      // Poll metering at 50ms intervals
      this.meteringInterval = setInterval(async () => {
        if (!this.recording) return;
        try {
          const status = await this.recording.getStatusAsync();
          const level = status.metering ?? -60;
          const isSpeaking = level > -40;
          if (this.onMeteringUpdate) {
            this.onMeteringUpdate(level, isSpeaking);
          }
        } catch {
          // Recording may have stopped
        }
      }, 50);
    } catch (error) {
      this.isRecordingInProgress = false;
      this.onMeteringUpdate = undefined;
      throw error;
    }
  }

  async stopRecordingWithMetering(): Promise<string | null> {
    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
    }
    this.onMeteringUpdate = undefined;
    return this.stopRecording();
  }

  async stopRecording(): Promise<string | null> {
    try {
      if (!this.recording) {
        this.isRecordingInProgress = false;
        return null;
      }

      const status = await this.recording.getStatusAsync();
      let uri: string | null = null;

      if (status.isRecording) {
        await this.recording.stopAndUnloadAsync();
        uri = this.recording.getURI();
      } else if (status.isDoneRecording) {
        uri = this.recording.getURI();
        try {
          await this.recording.stopAndUnloadAsync();
        } catch {
          // Already unloaded
        }
      }

      this.recording = null;
      this.isRecordingInProgress = false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      return uri;
    } catch (error) {
      this.recording = null;
      this.isRecordingInProgress = false;
      console.error('Stop recording error:', error);
      throw error;
    }
  }

  async playSound(uri: string): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({ uri });
      this.sound = sound;
      await sound.playAsync();
    } catch (error) {
      console.error('Play sound error:', error);
      throw error;
    }
  }

  async stopSound(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
    } catch (error) {
      console.error('Stop sound error:', error);
    }
  }

  isRecording(): boolean {
    return this.isRecordingInProgress;
  }

  async cleanup(): Promise<void> {
    // Use WebAudioService for web platform
    if (Platform.OS === 'web') {
      await webAudioService.cleanup();
      return;
    }

    try {
      // Stop real-time mode if active
      this.stopRealtimeMode();

      if (this.recording) {
        try {
          const status = await this.recording.getStatusAsync();
          if (status.isRecording || status.isDoneRecording) {
            await this.recording.stopAndUnloadAsync();
          }
        } catch {
          // Recording already cleaned up
        }
        this.recording = null;
      }

      this.isRecordingInProgress = false;

      if (this.sound) {
        await this.stopSound();
      }

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (error) {
      console.error('Cleanup error:', error);
      this.recording = null;
      this.isRecordingInProgress = false;
    }
  }

  // ============================================================================
  // REAL-TIME TRANSLATION MODE
  // ============================================================================

  /**
   * Start real-time translation mode with VAD (Voice Activity Detection)
   */
  async startRealtimeMode(
    onSegmentReady: (segment: AudioSegment) => void,
    onMeteringUpdate?: (level: number, isSpeaking: boolean) => void
  ): Promise<boolean> {
    // Use WebAudioService for web platform
    if (Platform.OS === 'web') {
      console.log('Using WebAudioService for web platform');
      return webAudioService.startRealtimeMode(onSegmentReady, onMeteringUpdate);
    }

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.error('Microphone permission not granted');
        return false;
      }

      this.isRealtimeMode = true;
      this.segmentCount = 0;
      this.onSegmentReady = onSegmentReady;
      this.onMeteringUpdate = onMeteringUpdate;
      this.isSpeaking = false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start listening for voice activity
      await this.startListening();

      console.log('Real-time mode started');
      return true;
    } catch (error) {
      console.error('Start realtime mode error:', error);
      this.isRealtimeMode = false;
      return false;
    }
  }

  /**
   * Stop real-time translation mode
   */
  stopRealtimeMode(): void {
    // Use WebAudioService for web platform
    if (Platform.OS === 'web') {
      webAudioService.stopRealtimeMode();
      return;
    }

    console.log('Stopping real-time mode...');

    // CRITICAL: Set flag first to prevent any new operations
    this.isRealtimeMode = false;

    // Clear metering interval BEFORE stopping recording
    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
      console.log('Metering interval cleared');
    }

    // Clear callbacks to prevent any late calls
    this.onSegmentReady = undefined;
    this.onMeteringUpdate = undefined;

    // Now stop recording
    if (this.recording) {
      this.stopSegmentRecording().catch(console.error);
    }

    this.isSpeaking = false;

    // Reset speech state machine
    this.nativeSpeechState = 'silence';
    this.nativeStateChangeTime = 0;
    this.nativeSpeechStartTime = 0;
    this.nativeNoiseSamples = [];
    this.nativeNoiseFloor = VAD_CONFIG.SILENCE_THRESHOLD;

    console.log('Real-time mode stopped');
  }

  /**
   * Start listening with metering to detect voice activity
   */
  private async startListening(): Promise<void> {
    try {
      // CRITICAL: Clean up any existing recording before creating a new one
      if (this.recording) {
        console.log('Cleaning up existing recording before starting new one...');
        try {
          const status = await this.recording.getStatusAsync();
          if (status.isRecording || status.isDoneRecording) {
            await this.recording.stopAndUnloadAsync();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        this.recording = null;
      }

      // Minimal delay to ensure audio system is ready
      await new Promise(resolve => setTimeout(resolve, 30));

      // Create recording with optimized settings for speech
      const { recording } = await Audio.Recording.createAsync(
        {
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 48000, // Higher sample rate for better quality
            numberOfChannels: 1,
            bitRate: 128000, // Higher bitrate
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MAX,
            sampleRate: 48000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
          isMeteringEnabled: true,
        },
        (status) => {
          // This is called on each metering update
        },
        VAD_CONFIG.METERING_INTERVAL_MS
      );

      this.recording = recording;
      this.segmentStartTime = Date.now();
      this.lastSpeechTime = Date.now();
      this.isRecordingInProgress = true;

      // Reset speech state for new segment
      this.nativeSpeechState = 'silence';
      this.nativeSpeechStartTime = 0;

      // Start metering interval with optimized timing
      console.log('Starting metering interval with', VAD_CONFIG.METERING_INTERVAL_MS, 'ms interval');
      this.meteringInterval = setInterval(() => {
        this.checkVoiceActivity().catch(err => {
          console.error('Voice activity check failed:', err);
        });
      }, VAD_CONFIG.METERING_INTERVAL_MS);

    } catch (error) {
      console.error('Start listening error:', error);
      throw error;
    }
  }

  // Native speech state machine
  private nativeSpeechState: 'silence' | 'maybe_speech' | 'speech' | 'maybe_silence' = 'silence';
  private nativeStateChangeTime: number = 0;
  private nativeSpeechStartTime: number = 0;
  private nativeNoiseSamples: number[] = [];
  private nativeNoiseFloor: number = VAD_CONFIG.SILENCE_THRESHOLD;

  /**
   * Check voice activity with improved state machine
   */
  private async checkVoiceActivity(): Promise<void> {
    // Early exit if not in realtime mode or no recording
    if (!this.isRealtimeMode) return;
    if (!this.recording) {
      // Recording doesn't exist but we're still in realtime mode
      // This can happen during segment transitions - just skip this check
      return;
    }

    try {
      const status = await this.recording.getStatusAsync();
      if (!status.isRecording) return;

      const level = status.metering ?? -100;
      const now = Date.now();
      const segmentDuration = now - this.segmentStartTime;

      // Update adaptive noise floor during silence
      if (this.nativeSpeechState === 'silence') {
        this.nativeNoiseSamples.push(level);
        if (this.nativeNoiseSamples.length > VAD_CONFIG.NOISE_FLOOR_SAMPLES) {
          this.nativeNoiseSamples.shift();
        }
        const avgNoise = this.nativeNoiseSamples.reduce((a, b) => a + b, 0) / this.nativeNoiseSamples.length;
        this.nativeNoiseFloor = Math.max(avgNoise + VAD_CONFIG.NOISE_FLOOR_MARGIN_DB, VAD_CONFIG.SILENCE_THRESHOLD);
      }

      const isSpeechLevel = level > this.nativeNoiseFloor;
      const isDefiniteSpeech = level > VAD_CONFIG.SPEECH_THRESHOLD;

      // State machine for robust speech detection
      const prevState = this.nativeSpeechState;

      switch (this.nativeSpeechState) {
        case 'silence':
          if (isSpeechLevel) {
            this.nativeSpeechState = 'maybe_speech';
            this.nativeStateChangeTime = now;
          }
          break;

        case 'maybe_speech':
          if (isDefiniteSpeech || (isSpeechLevel && now - this.nativeStateChangeTime > VAD_CONFIG.SPEECH_START_DELAY_MS)) {
            this.nativeSpeechState = 'speech';
            this.nativeSpeechStartTime = this.nativeStateChangeTime;
            this.lastSpeechTime = now;
          } else if (!isSpeechLevel && now - this.nativeStateChangeTime > 100) {
            this.nativeSpeechState = 'silence';
          }
          break;

        case 'speech':
          if (isSpeechLevel) {
            this.lastSpeechTime = now;
          } else {
            this.nativeSpeechState = 'maybe_silence';
            this.nativeStateChangeTime = now;
          }
          break;

        case 'maybe_silence':
          if (isSpeechLevel) {
            this.nativeSpeechState = 'speech';
            this.lastSpeechTime = now;
          } else if (now - this.nativeStateChangeTime > VAD_CONFIG.SILENCE_DURATION_MS) {
            this.nativeSpeechState = 'silence';
          }
          break;
      }

      this.isSpeaking = this.nativeSpeechState === 'speech' || this.nativeSpeechState === 'maybe_speech';

      // Notify about metering update
      if (this.onMeteringUpdate) {
        this.onMeteringUpdate(level, this.isSpeaking);
      }

      // Decide whether to finalize segment
      const speechEnded = prevState === 'maybe_silence' && this.nativeSpeechState === 'silence';
      const maxDurationReached = segmentDuration > VAD_CONFIG.MAX_SEGMENT_DURATION_MS;
      const hasMinDuration = segmentDuration > VAD_CONFIG.MIN_SEGMENT_DURATION_MS;
      const hadSpeech = this.nativeSpeechStartTime > 0;

      if ((speechEnded && hasMinDuration && hadSpeech) || (maxDurationReached && hadSpeech)) {
        await this.finalizeCurrentSegment();
      }

    } catch (error) {
      console.error('Check voice activity error:', error);
    }
  }

  /**
   * Finalize current segment and start a new one
   */
  private async finalizeCurrentSegment(): Promise<void> {
    // Double check we're still in realtime mode
    if (!this.isRealtimeMode) {
      console.log('Not in realtime mode, skipping segment finalization');
      return;
    }

    if (!this.recording) {
      console.log('No recording to finalize');
      return;
    }

    // Store reference and clear immediately to prevent race conditions
    const currentRecording = this.recording;
    this.recording = null;

    try {
      const segmentDuration = Date.now() - this.segmentStartTime;

      // Stop current recording
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (uri && segmentDuration >= VAD_CONFIG.MIN_SEGMENT_DURATION_MS) {
        // Convert to base64 - using string literal for compatibility
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });

        this.segmentCount++;

        const segment: AudioSegment = {
          uri,
          base64,
          durationMs: segmentDuration,
          segmentId: this.segmentCount,
        };

        console.log(`Segment ${this.segmentCount} ready: ${segmentDuration}ms, ${base64.length} bytes`);

        // Notify about ready segment
        if (this.onSegmentReady) {
          this.onSegmentReady(segment);
        }

        // Clean up temp file
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          // Ignore cleanup errors
        }
      }

      // Reset speech state for new segment
      this.nativeSpeechState = 'silence';
      this.nativeSpeechStartTime = 0;

      // Start new recording if still in realtime mode
      if (this.isRealtimeMode) {
        await this.startListening();
      }

    } catch (error) {
      console.error('Finalize segment error:', error);

      // Reset speech state
      this.nativeSpeechState = 'silence';
      this.nativeSpeechStartTime = 0;

      // Try to restart listening
      if (this.isRealtimeMode) {
        this.recording = null;
        await this.startListening().catch(console.error);
      }
    }
  }

  /**
   * Stop segment recording (internal use)
   */
  private async stopSegmentRecording(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // Ignore
      }
      this.recording = null;
    }
    this.isRecordingInProgress = false;
  }

  /**
   * Get current segment count
   */
  getSegmentCount(): number {
    return this.segmentCount;
  }

  /**
   * Reset segment counter (for fresh sessions)
   */
  resetSegmentCount(): void {
    this.segmentCount = 0;
    console.log('Segment counter reset');
  }

  /**
   * Check if in realtime mode
   */
  isInRealtimeMode(): boolean {
    if (Platform.OS === 'web') {
      return webAudioService.isInRealtimeMode();
    }
    return this.isRealtimeMode;
  }
}

export const audioService = new AudioService();
