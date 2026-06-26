import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, MousePointer2, Mic, X, Maximize2, Terminal, Power, Video, Keyboard, Move, RotateCcw, Hand, Wifi, Cpu, HardDrive, Shield, Activity, Zap, AppWindow } from 'lucide-react';
import { getCurrentServerUrl } from '../services/serverResolver';
import type { Report } from '../App';
import type { Socket } from 'socket.io-client';
import { useRBAC } from '../utils/rbac';
import { api } from '../services/api';
import { useToast } from './ui/Toast';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
  cpu?: number;
  ram?: number;
  activeApp?: string;
}

interface MonitoreoProps {
  devices: Device[];
  screenshots: Record<string, any>;
  globalReports: Report[];
  addReport: (device: string, type: string, description: string, status?: string) => void;
  socket: Socket | null;
}

// Touch gesture thresholds
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_THRESHOLD = 10;

export function MonitoreoView({ devices, screenshots, globalReports, addReport, socket }: MonitoreoProps) {
  const { hasPermission } = useRBAC();
  const { addToast } = useToast();
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [remoteState, setRemoteState] = useState<'none' | 'connecting' | 'remote' | 'terminal'>('none');
  const [sessionTime, setSessionTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'acciones' | 'historial' | 'capturas'>('acciones');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [showMobileKeyboard, setShowMobileKeyboard] = useState(false);
  const [mobileInputText, setMobileInputText] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<Array<{ text: string; isError: boolean }>>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [isAudioActive, setIsAudioActive] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const screenContainerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const lastTouchRef = useRef(0); // prevent ghost clicks from touch
  // WebRTC
  const webrtcVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcPcRef = useRef<RTCPeerConnection | null>(null);
  const [webrtcActive, setWebrtcActive] = useState(false);

  // Touch feedback: ripple effect + pinch zoom
  const [tapRipple, setTapRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const [pinchScale, setPinchScale] = useState(1);
  const [pinchOrigin, setPinchOrigin] = useState({ x: 50, y: 50 });
  const pinchStartDist = useRef(0);

  // Real-time activity feed
  interface ActivityEntry {
    id: string;
    deviceId: string;
    deviceName: string;
    description: string;
    type: string;
    date: string;
    appSession?: { appName: string; startedAt: string };
  }
  const [liveActivities, setLiveActivities] = useState<ActivityEntry[]>([]);
  const MAX_LIVE_ACTIVITIES = 30;

  // Screenshot history
  const [screenshotTimeline, setScreenshotTimeline] = useState<Array<{ id: string; image: string | null; timestamp: string; deviceName: string; driveFileId?: string }>>([]);
  const [loadingScreenshots, setLoadingScreenshots] = useState(false);

  // Drive status
  const [driveStatus, setDriveStatus] = useState<{ enabled: boolean; authenticated: boolean; requiresAuth: boolean; authUrl: string | null } | null>(null);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);

  // Inline notification (replaces alert/confirm)
  const [inlineNotif, setInlineNotif] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; msg: string } | null>(null);
  const showNotif = (type: 'success' | 'error' | 'info' | 'warning', msg: string) => {
    setInlineNotif({ type, msg });
    setTimeout(() => setInlineNotif(null), 4000);
  };

  // Touch gesture state refs (not reactive - performance critical)
  const touchState = useRef({
    lastTapTime: 0,
    lastTapPos: { x: 0, y: 0 },
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    touchStartPos: { x: 0, y: 0 },
    touchStartTime: 0,
    isTwoFinger: false,
    lastTwoFingerY: 0,
    lastTwoFingerX: 0,
    isDragging: false,
    hasMoved: false,
  });

  // Subscribe to device room for targeted screenshots
  useEffect(() => {
    if (!socket || !selectedDevice) return;
    socket.emit('dashboard:subscribe', { deviceId: selectedDevice.id });
    return () => {
      socket.emit('dashboard:unsubscribe', { deviceId: selectedDevice.id });
    };
  }, [socket, selectedDevice]);

  // ─── Session reconnection: restore remote/terminal session on socket reconnect ───
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    if (!socket) return;
    const handleReconnect = () => {
      if (selectedDevice && (remoteState === 'remote' || remoteState === 'terminal')) {
        setReconnecting(true);
        // Re-subscribe to device room
        socket.emit('dashboard:subscribe', { deviceId: selectedDevice.id });
        // Re-start remote session
        socket.emit('start-remote', { deviceId: selectedDevice.id });
        if (remoteState === 'terminal') {
          socket.emit('terminal:start', { deviceId: selectedDevice.id });
        }
        setTimeout(() => setReconnecting(false), 2000);
      }
    };
    socket.on('connect', handleReconnect);
    return () => { socket.off('connect', handleReconnect); };
  }, [socket, selectedDevice, remoteState]);

  // Listen for terminal output
  useEffect(() => {
    if (!socket) return;
    const handleTerminalOutput = (data: { deviceId: string; output: string; isError: boolean }) => {
      if (selectedDevice && data.deviceId === selectedDevice.id) {
        setTerminalOutput(prev => [...prev, { text: data.output, isError: data.isError }]);
      }
    };
    socket.on('terminal:output', handleTerminalOutput);
    return () => { socket.off('terminal:output', handleTerminalOutput); };
  }, [socket, selectedDevice]);

  useEffect(() => {
    let interval: number;
    if (remoteState === 'remote' || remoteState === 'terminal') {
      interval = window.setInterval(() => setSessionTime(t => t + 1), 1000);
    } else {
      setSessionTime(0);
    }
    return () => clearInterval(interval);
  }, [remoteState]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalOutput]);

  // Listen for real-time activity logs from server
  useEffect(() => {
    if (!socket) return;
    const handleActivityLog = (data: ActivityEntry) => {
      setLiveActivities(prev => {
        const next = [data, ...prev];
        return next.slice(0, MAX_LIVE_ACTIVITIES);
      });
    };
    socket.on('activity-log', handleActivityLog);
    return () => { socket.off('activity-log', handleActivityLog); };
  }, [socket]);

  // WebRTC: handle signaling from server (agent sends offer, admin answers)
  useEffect(() => {
    if (!socket) return;

    const startPc = () => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });
      webrtcPcRef.current = pc;

      pc.ontrack = (event) => {
        if (webrtcVideoRef.current && event.streams[0]) {
          webrtcVideoRef.current.srcObject = event.streams[0];
          setWebrtcActive(true);
          console.log('[WebRTC] Video stream recibido ✓');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && selectedDevice) {
          socket.emit('webrtc:ice-candidate', { deviceId: selectedDevice?.id, candidate: event.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setWebrtcActive(false);
        }
      };

      return pc;
    };

    const handleOffer = async (data: { deviceId: string; offer: RTCSessionDescriptionInit }) => {
      if (!selectedDevice || data.deviceId !== selectedDevice.id) return;
      try {
        if (webrtcPcRef.current) {
          webrtcPcRef.current.close();
        }
        const pc = startPc();
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { deviceId: selectedDevice.id, answer });
        console.log('[WebRTC] Respuesta enviada al agente');
      } catch (err) {
        console.error('[WebRTC] Error al procesar oferta:', err);
      }
    };

    const handleAnswer = async (data: { deviceId: string; answer: RTCSessionDescriptionInit }) => {
      if (!selectedDevice || data.deviceId !== selectedDevice.id) return;
      try {
        await webrtcPcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        console.error('[WebRTC] Error al procesar respuesta:', err);
      }
    };

    const handleIce = async (data: { deviceId: string; candidate: RTCIceCandidateInit }) => {
      if (!selectedDevice || data.deviceId !== selectedDevice.id) return;
      try {
        await webrtcPcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch {}
    };

    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIce);

    return () => {
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIce);
    };
  }, [socket, selectedDevice]);

  // Cleanup WebRTC on device change or unmount
  useEffect(() => {
    return () => {
      if (webrtcPcRef.current) {
        webrtcPcRef.current.close();
        webrtcPcRef.current = null;
      }
      setWebrtcActive(false);
    };
  }, [selectedDevice]);

  // Screenshot history from Google Drive (filtered by day)
  const [screenshotDate, setScreenshotDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Fetch screenshot history when capturas tab is active (from Drive, filtered by date)
  useEffect(() => {
    if (activeTab !== 'capturas' || !selectedDevice) return;

    // Fetch Drive status
    const fetchDriveStatus = async () => {
      setDriveStatusLoading(true);
      try {
        const res = await api.get('/drive/status');
        setDriveStatus(res.data);
      } catch {
        setDriveStatus({ enabled: false, authenticated: false, requiresAuth: false, authUrl: null });
      } finally {
        setDriveStatusLoading(false);
      }
    };
    fetchDriveStatus();

    const fetchTimeline = async () => {
      setLoadingScreenshots(true);
      try {
        // Try Drive first (filtered by device name + date)
        const driveRes = await api.get(`/drive/screenshots?device=${encodeURIComponent(selectedDevice.name)}&date=${screenshotDate}`);
        if (driveRes.data && driveRes.data.length > 0) {
          setScreenshotTimeline(driveRes.data.map((s: any) => ({
            id: s.id,
            image: null,
            timestamp: s.createdTime || s.time,
            deviceName: selectedDevice.name,
            driveFileId: s.id,
          })));
        } else {
          // Fallback to legacy in-memory timeline
          const res = await api.get(`/screenshots/timeline?deviceId=${selectedDevice.id}`).catch(() => ({ data: [] }));
          setScreenshotTimeline(res.data);
        }
      } catch {
        setScreenshotTimeline([]);
      } finally {
        setLoadingScreenshots(false);
      }
    };
    fetchTimeline();
  }, [activeTab, selectedDevice, screenshotDate]);

  // Prevent browser gestures (pinch zoom, swipe back) when in remote mode
  useEffect(() => {
    if (remoteState !== 'remote') return;

    const preventGestures = (e: TouchEvent) => {
      // Allow multi-touch gestures (like pinch-to-zoom) by ignoring them here
      if (e.touches.length > 1) return;
      
      if (screenContainerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventGestures, { passive: false });
    document.addEventListener('gesturestart', preventGestures as any, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventGestures);
      document.removeEventListener('gesturestart', preventGestures as any);
    };
  }, [remoteState]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Get the actual rendered image bounds accounting for object-contain letterboxing
  // Uses CONTAINER as reference to avoid issues with CSS transforms, borders, or ring on the img element
  const getImageBounds = useCallback(() => {
    const container = screenContainerRef.current;
    // Use video dimensions if WebRTC is active
    const video = webrtcVideoRef.current;
    const img = imgRef.current;

    let naturalWidth = 0;
    let naturalHeight = 0;

    if (video && video.srcObject && video.videoWidth) {
      naturalWidth = video.videoWidth;
      naturalHeight = video.videoHeight;
    } else if (img && img.naturalWidth) {
      naturalWidth = img.naturalWidth;
      naturalHeight = img.naturalHeight;
    }

    if (!container || !naturalWidth || !naturalHeight) return null;

    // Use container rect as the stable reference (unaffected by pinch-zoom transform on img)
    const containerRect = container.getBoundingClientRect();
    const naturalAspect = naturalWidth / naturalHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let imgLeft: number, imgTop: number, imgWidth: number, imgHeight: number;

    if (naturalAspect > containerAspect) {
      // Image wider than container -> letterbox top/bottom
      imgWidth = containerRect.width;
      imgHeight = containerRect.width / naturalAspect;
      imgLeft = containerRect.left;
      imgTop = containerRect.top + (containerRect.height - imgHeight) / 2;
    } else {
      // Image taller than container -> letterbox left/right
      imgHeight = containerRect.height;
      imgWidth = containerRect.height * naturalAspect;
      imgLeft = containerRect.left + (containerRect.width - imgWidth) / 2;
      imgTop = containerRect.top;
    }

    return { imgLeft, imgTop, imgWidth, imgHeight };
  }, []);

  const getNormalizedPos = useCallback((clientX: number, clientY: number) => {
    const container = screenContainerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const bounds = getImageBounds();
    if (!bounds) {
      const rect = container.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    }

    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.imgLeft) / bounds.imgWidth)),
      y: Math.max(0, Math.min(1, (clientY - bounds.imgTop) / bounds.imgHeight)),
    };
  }, [getImageBounds]);

  const getNormalizedPosFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      const touch = e.touches[0] || (e as any).changedTouches?.[0];
      if (!touch) return { x: 0, y: 0 };
      return getNormalizedPos(touch.clientX, touch.clientY);
    }
    return getNormalizedPos(e.clientX, e.clientY);
  }, [getNormalizedPos]);

  // ─── Remote control: Mouse event handlers ───
  // Guard: ignore mouse events triggered by touch (ghost clicks)
  const isRecentTouch = () => Date.now() - lastTouchRef.current < 500;

  // Calculate cursor position relative to the screen container (for absolute positioning)
  // This should place the cursor exactly where the normalized position maps to visually
  const getCursorRelativePos = useCallback((clientX: number, clientY: number) => {
    const container = screenContainerRef.current;
    if (!container) return { x: clientX, y: clientY };
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket || isRecentTouch()) return;
    const pos = getNormalizedPosFromEvent(e);
    setCursorPos(getCursorRelativePos(e.clientX, e.clientY));
    setShowCursor(true);
    socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'move' });
  }, [remoteState, selectedDevice, socket, getNormalizedPosFromEvent, getCursorRelativePos]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket || isRecentTouch()) return;
    e.preventDefault();
    const pos = getNormalizedPosFromEvent(e);
    const button = e.button === 2 ? 'right' : 'left';
    socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'click', button });
  }, [remoteState, selectedDevice, socket, getNormalizedPosFromEvent]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket || isRecentTouch()) return;
    e.preventDefault();
    const pos = getNormalizedPosFromEvent(e);
    socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'dblclick' });
  }, [remoteState, selectedDevice, socket, getNormalizedPosFromEvent]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote') return;
    e.preventDefault();
    if (!selectedDevice || !socket || isRecentTouch()) return;
    const pos = getNormalizedPosFromEvent(e);
    socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'rightclick' });
  }, [remoteState, selectedDevice, socket, getNormalizedPosFromEvent]);

  // ─── Scroll handler (imperative, non-passive to allow preventDefault) ───
  useEffect(() => {
    const el = screenContainerRef.current;
    if (!el || remoteState !== 'remote' || !selectedDevice || !socket) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      socket.emit('remote:scroll', { deviceId: selectedDevice.id, deltaX: e.deltaX, deltaY: e.deltaY > 0 ? -3 : 3 });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [remoteState, selectedDevice, socket]);

  // ─── Keyboard handler (desktop) ───
  useEffect(() => {
    if (remoteState !== 'remote' || !selectedDevice || !socket) return;
    const keyMap: Record<string, string> = {
      'Enter': 'enter', 'Backspace': 'backspace', 'Tab': 'tab', 'Escape': 'escape',
      'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
      'Delete': 'delete', 'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
      ' ': 'space', 'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5',
      'F6': 'f6', 'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if mobile keyboard input is focused
      if (mobileInputRef.current === document.activeElement) return;
      e.preventDefault();
      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('control');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');
      if (e.metaKey) modifiers.push('command');
      const key = keyMap[e.key] || (e.key.length === 1 ? e.key.toLowerCase() : null);
      if (!key) return;
      socket.emit('remote:keyboard', { deviceId: selectedDevice.id, key, type: 'keydown', modifiers });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [remoteState, selectedDevice, socket]);

  // ─── Mobile keyboard input handler ───
  const handleMobileInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    if (!selectedDevice || !socket) return;
    const value = (e.target as HTMLInputElement).value;
    const prevValue = mobileInputText;

    if (value.length > prevValue.length) {
      // Character(s) added - send them as keystrokes
      const newChars = value.slice(prevValue.length);
      for (const char of newChars) {
        socket.emit('remote:keyboard', { deviceId: selectedDevice.id, key: char.toLowerCase(), type: 'keydown', modifiers: [] });
      }
    } else if (value.length < prevValue.length) {
      // Characters removed - send backspace
      const deletedCount = prevValue.length - value.length;
      for (let i = 0; i < deletedCount; i++) {
        socket.emit('remote:keyboard', { deviceId: selectedDevice.id, key: 'backspace', type: 'keydown', modifiers: [] });
      }
    }
    setMobileInputText(value);
  }, [selectedDevice, socket, mobileInputText]);

  const handleMobileKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!selectedDevice || !socket) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      socket.emit('remote:keyboard', { deviceId: selectedDevice.id, key: 'enter', type: 'keydown', modifiers: [] });
      setMobileInputText('');
    }
  }, [selectedDevice, socket]);

  // ─── Touch gesture handlers (mobile-optimized) ───
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket) return;
    lastTouchRef.current = Date.now();

    const ts = touchState.current;
    const now = Date.now();
    const touch = e.touches[0];

    // Two-finger gesture (scroll or pinch-to-zoom)
    if (e.touches.length === 2) {
      ts.isTwoFinger = true;
      ts.lastTwoFingerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      ts.lastTwoFingerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      // Calculate initial pinch distance for zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      // Set zoom origin to midpoint of two fingers relative to container
      const container = screenContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setPinchOrigin({
          x: ((ts.lastTwoFingerX - rect.left) / rect.width) * 100,
          y: ((ts.lastTwoFingerY - rect.top) / rect.height) * 100,
        });
      }
      if (ts.longPressTimer) { clearTimeout(ts.longPressTimer); ts.longPressTimer = null; }
      return;
    }

    ts.isTwoFinger = false;
    ts.touchStartPos = { x: touch.clientX, y: touch.clientY };
    ts.touchStartTime = now;
    ts.hasMoved = false;
    ts.isDragging = false;

    // Move cursor to touch position immediately and show it
    const pos = getNormalizedPos(touch.clientX, touch.clientY);
    setCursorPos(getCursorRelativePos(touch.clientX, touch.clientY));
    setShowCursor(true);
    socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'move' });

    // Start long press timer (right click)
    if (ts.longPressTimer) clearTimeout(ts.longPressTimer);
    ts.longPressTimer = setTimeout(() => {
      if (!ts.hasMoved) {
        const pos = getNormalizedPos(ts.touchStartPos.x, ts.touchStartPos.y);
        socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'rightclick' });
        ts.isDragging = false;
        // Haptic feedback for right-click
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      }
      ts.longPressTimer = null;
    }, LONG_PRESS_MS);
  }, [remoteState, selectedDevice, socket, getNormalizedPos, getCursorRelativePos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket) return;
    lastTouchRef.current = Date.now();

    const ts = touchState.current;

    // Two-finger: pinch-to-zoom + scroll
    if (ts.isTwoFinger && e.touches.length === 2) {
      const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaY = ts.lastTwoFingerY - currentY;
      ts.lastTwoFingerY = currentY;

      // Pinch-to-zoom detection
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      if (pinchStartDist.current > 0) {
        const newScale = Math.max(1, Math.min(3, currentDist / pinchStartDist.current * pinchScale));
        setPinchScale(newScale);
      }

      // Also send scroll if vertical movement is dominant
      if (Math.abs(deltaY) > 4 && pinchScale <= 1.1) {
        socket.emit('remote:scroll', { deviceId: selectedDevice.id, deltaX: 0, deltaY: deltaY > 0 ? -3 : 3 });
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx2 = touch.clientX - ts.touchStartPos.x;
    const dy2 = touch.clientY - ts.touchStartPos.y;

    // Check if moved beyond tap threshold
    if (Math.abs(dx2) > TAP_MOVE_THRESHOLD || Math.abs(dy2) > TAP_MOVE_THRESHOLD) {
      ts.hasMoved = true;
      if (ts.longPressTimer) { clearTimeout(ts.longPressTimer); ts.longPressTimer = null; }
      
      // Prevent browser scroll ONLY for single-finger panning
      if (e.cancelable) e.preventDefault();
    }

    // Send mouse move - directly map touch position on screen image
    if (ts.hasMoved) {
      const pos = getNormalizedPos(touch.clientX, touch.clientY);
      setCursorPos(getCursorRelativePos(touch.clientX, touch.clientY));
      setShowCursor(true);
      socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'move' });
    }
  }, [remoteState, selectedDevice, socket, getNormalizedPos, getCursorRelativePos, pinchScale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socket) return;
    lastTouchRef.current = Date.now();

    const ts = touchState.current;

    // Clear long press timer
    if (ts.longPressTimer) { clearTimeout(ts.longPressTimer); ts.longPressTimer = null; }

    // Reset pinch zoom on release
    if (ts.isTwoFinger) {
      if (e.touches.length === 0) {
        ts.isTwoFinger = false;
        // Snap back to 1x after a delay if scale is close to 1
        if (pinchScale < 1.15) {
          setPinchScale(1);
        }
      }
      return;
    }

    const now = Date.now();
    const duration = now - ts.touchStartTime;

    // Only register tap if finger didn't move significantly and wasn't a long press
    if (!ts.hasMoved && duration < LONG_PRESS_MS) {
      const pos = getNormalizedPos(ts.touchStartPos.x, ts.touchStartPos.y);

      // Show ripple effect at tap location
      const relPos = getCursorRelativePos(ts.touchStartPos.x, ts.touchStartPos.y);
      setTapRipple({ x: relPos.x, y: relPos.y, id: now });
      setTimeout(() => setTapRipple(null), 500);

      // Haptic feedback for tap
      if (navigator.vibrate) navigator.vibrate(10);

      // Double tap detection
      const timeSinceLastTap = now - ts.lastTapTime;
      const distFromLastTap = Math.hypot(
        ts.touchStartPos.x - ts.lastTapPos.x,
        ts.touchStartPos.y - ts.lastTapPos.y
      );

      if (timeSinceLastTap < DOUBLE_TAP_MS && distFromLastTap < 30) {
        // Double tap -> double click + reset zoom
        socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'dblclick' });
        ts.lastTapTime = 0;
        // Double-tap also toggles zoom
        setPinchScale(prev => prev > 1 ? 1 : 2);
        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      } else {
        // Single tap -> click
        socket.emit('remote:mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'click', button: 'left' });
        ts.lastTapTime = now;
        ts.lastTapPos = { ...ts.touchStartPos };
      }
    }

    ts.hasMoved = false;
    ts.isDragging = false;
  }, [remoteState, selectedDevice, socket, getNormalizedPos, getCursorRelativePos, pinchScale]);

  const handleStartSession = (type: 'remote' | 'terminal') => {
    setRemoteState('connecting');
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Sesión', `Inició acceso ${type === 'remote' ? 'remoto' : 'por terminal'}`);
      if (socket) {
        socket.emit('start-remote', { deviceId: selectedDevice.id });
        if (type === 'terminal') {
          setTerminalOutput([]);
          socket.emit('terminal:start', { deviceId: selectedDevice.id });
        }
      }
    }
    setTimeout(() => {
      setRemoteState(type);
      if (type === 'terminal') {
        setTimeout(() => terminalInputRef.current?.focus(), 200);
      }
    }, 1500);
  };

  const handleEndSession = () => {
    if (selectedDevice && socket) {
      socket.emit('stop-remote', { deviceId: selectedDevice.id });
      if (remoteState === 'terminal') {
        socket.emit('terminal:stop', { deviceId: selectedDevice.id });
      }
      addReport(selectedDevice.id, 'Sesión', 'Finalizó sesión de control remoto');
    }
    stopAudioStream();
    setRemoteState('none');
    setTerminalOutput([]);
    setTerminalInput('');
  };

  const handleCtrlAltDel = () => {
    if (selectedDevice && socket) {
      socket.emit('remote-ctrl-alt-del', { deviceId: selectedDevice.id });
      addReport(selectedDevice.id, 'Sistema', 'Envió Ctrl+Alt+Supr');
    }
  };

  // ─── HD Quality Toggle ───
  const [isHD, setIsHD] = useState(false);
  const handleToggleHD = () => {
    if (!selectedDevice || !socket) return;
    const newHD = !isHD;
    setIsHD(newHD);
    socket.emit('stream:quality', {
      deviceId: selectedDevice.id,
      quality: newHD ? 95 : 60,
      fps: newHD ? 10 : 15,
    });
  };

  // ─── Terminal command execution ───
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !selectedDevice || !socket) return;

    // Show the command in the terminal output
    setTerminalOutput(prev => [...prev, { text: `> ${terminalInput}\n`, isError: false }]);
    socket.emit('terminal:input', { deviceId: selectedDevice.id, command: terminalInput });
    setTerminalInput('');
  };

  const deleteDevice = (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    
    fetch(`/api/devices/${deviceId}`, { method: 'DELETE' })
      .then(() => {
        addToast({ type: 'success', title: 'Dispositivo eliminado', message: 'El dispositivo desconectado fue removido correctamente.' });
      })
      .catch(err => {
        console.error('Error deleting device:', err);
        addToast({ type: 'error', title: 'Error', message: 'No se pudo eliminar el dispositivo.' });
      });
  };

  // ─── Escucha Activa (Audio streaming to remote PC) ───
  const startAudioStream = async () => {
    if (!selectedDevice || !socket) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        }
      });
      audioStreamRef.current = stream;

      // Notify agent to prepare for audio
      socket.emit('audio:start', { deviceId: selectedDevice.id });

      // Use MediaRecorder to capture audio chunks
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socket && selectedDevice) {
          // Convert blob to base64 and send
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            socket.emit('audio:chunk', {
              deviceId: selectedDevice.id,
              chunk: base64,
              mimeType,
            });
          };
          reader.readAsDataURL(event.data);
        }
      };

      // Send audio chunks every 200ms for near real-time
      recorder.start(200);
      audioRecorderRef.current = recorder;
      setIsAudioActive(true);
      addReport(selectedDevice.id, 'Sistema', 'Escucha activa iniciada - micrófono transmitiendo');
    } catch (err) {
      console.error('Error accediendo al micrófono:', err);
      addToast({ type: 'error', title: 'Micrófono no disponible', message: 'No se pudo acceder al micrófono. Verifica los permisos del navegador.' });
    }
  };

  const stopAudioStream = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (selectedDevice && socket) {
      socket.emit('audio:stop', { deviceId: selectedDevice.id });
    }
    setIsAudioActive(false);
  };

  const toggleAudioStream = () => {
    if (isAudioActive) {
      stopAudioStream();
    } else {
      startAudioStream();
    }
  };

  const handlePowerOff = () => {
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Alerta', 'Apagado forzado del equipo ejecutado', 'Crítico');
      if (socket) socket.emit('remote-power', { deviceId: selectedDevice.id, action: 'shutdown' });
    }
    closeDeviceModal();
  };

  const handleRestart = () => {
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Sistema', 'Reinicio remoto ejecutado');
      if (socket) socket.emit('remote-power', { deviceId: selectedDevice.id, action: 'restart' });
    }
    closeDeviceModal();
  };

  const closeDeviceModal = () => {
    if (selectedDevice && socket && (remoteState === 'remote' || remoteState === 'terminal')) {
      socket.emit('stop-remote', { deviceId: selectedDevice.id });
      if (remoteState === 'terminal') {
        socket.emit('terminal:stop', { deviceId: selectedDevice.id });
      }
    }
    stopAudioStream();
    setSelectedDevice(null);
    setRemoteState('none');
    setActiveTab('acciones');
    setShowCursor(false);
    setShowMobileKeyboard(false);
    setMobileInputText('');
    setTerminalOutput([]);
    setTerminalInput('');
  };

  const onlineDevices = devices.filter(d => d.status === 'online');

  // Helper: time ago
  const timeAgo = (dateStr: string) => {
    const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 5) return 'ahora';
    if (diff < 60) return `hace ${diff}s`;
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
    return `hace ${Math.floor(diff / 3600)}h`;
  };

  // Helper: get app icon category
  const getAppCategory = (appName: string) => {
    const lower = appName.toLowerCase();
    if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('brave') || lower.includes('opera')) return 'browser';
    if (lower.includes('code') || lower.includes('visual studio') || lower.includes('intellij') || lower.includes('sublime')) return 'ide';
    if (lower.includes('word') || lower.includes('excel') || lower.includes('powerpoint') || lower.includes('outlook')) return 'office';
    if (lower.includes('slack') || lower.includes('teams') || lower.includes('discord') || lower.includes('zoom')) return 'comms';
    if (lower.includes('explorer') || lower.includes('finder')) return 'system';
    return 'other';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'browser': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'ide': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'office': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'comms': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'system': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      default: return 'text-brand bg-brand/10 border-brand/20';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 sm:mb-8 gap-3 sm:gap-4 animate-slide-up">
        <div>
          <div className="flex items-center gap-2 mb-1 sm:mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">War Room</h3>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-text-primary mb-1 sm:mb-2 tracking-tight leading-tight">
            Monitoreo en vivo
          </h1>
          <p className="text-text-secondary text-xs sm:text-sm max-w-lg leading-relaxed hidden sm:block">
            Vista consolidada de pantallas activas en tiempo real. Click en un tile para ver detalles y tomar control.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2.5 bg-surface-elevated/50 border border-surface-border px-4 py-2 rounded-lg">
            <div className="relative">
              <Radio className="w-4 h-4 text-brand" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand rounded-full animate-ping" />
            </div>
            <span className="text-[13px] font-semibold text-text-primary tracking-tight">
              EN VIVO <span className="text-brand">&bull;</span> {onlineDevices.length} transmisión{onlineDevices.length !== 1 ? 'es' : ''} activa{onlineDevices.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Live Activity Feed (Real-time) ─── */}
      {liveActivities.length > 0 && (
        <div className="mb-6 animate-slide-up">
          <div className="glass-subtle rounded-2xl border border-surface-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border/50 bg-surface-elevated/30">
              <Activity className="w-4 h-4 text-brand" />
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Actividad en Tiempo Real</span>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                <span className="text-[10px] text-text-tertiary font-mono">EN VIVO</span>
              </div>
            </div>
            <div className="max-h-[120px] overflow-y-auto scrollbar-thin">
              {liveActivities.slice(0, 8).map((act, i) => (
                <div key={act.id || i} className={`flex items-center gap-3 px-4 py-2 border-b border-surface-border/20 last:border-b-0 transition-all duration-300 ${i === 0 ? 'bg-brand/5' : 'hover:bg-surface-elevated/30'}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${act.appSession ? getCategoryColor(getAppCategory(act.appSession.appName)) : 'text-text-tertiary bg-surface-elevated border-surface-border'}`}>
                    <AppWindow className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-text-primary truncate">@{act.deviceName?.toLowerCase() || 'unknown'}</span>
                      {i === 0 && <Zap className="w-3 h-3 text-brand shrink-0" />}
                    </div>
                    <p className="text-[10px] text-text-secondary truncate">{act.description}</p>
                  </div>
                  <span className="text-[9px] text-text-tertiary font-mono shrink-0">{timeAgo(act.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Device Grid ─── */}
      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border animate-slide-up">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center border border-surface-border">
              <Wifi className="w-8 h-8 text-text-tertiary" />
            </div>
          </div>
          <p className="text-text-primary font-semibold text-lg mb-1">Esperando conexiones...</p>
          <p className="text-text-tertiary text-[13px] max-w-sm text-center">
            Instala el agente VisionControl en los equipos para comenzar el monitoreo en tiempo real.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-6 stagger-2">
          {devices.map((device) => {
            const isOnline = device.status === 'online';
            const cpuPercent = device.cpu || 0;
            const ramPercent = device.ram || 0;
            const cpuColor = cpuPercent > 80 ? 'bg-status-error' : cpuPercent > 60 ? 'bg-status-warning' : 'bg-emerald-500';
            const ramColor = ramPercent > 85 ? 'bg-status-error' : ramPercent > 70 ? 'bg-status-warning' : 'bg-blue-500';

            return (
              <div
                key={device.id}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer hover-card ${
                  isOnline
                    ? 'glass-subtle border-surface-border hover:border-brand/50 glow-brand'
                    : 'bg-surface-elevated/30 border-surface-border opacity-60 hover:opacity-80'
                  }`}
                onClick={() => setSelectedDevice(device)}
              >
                {/* Screenshot Area */}
                <div className="aspect-video bg-black relative overflow-hidden rounded-t-2xl">
                  {screenshots[device.id]?.image ? (
                    <img
                      src={screenshots[device.id]?.image}
                      alt={`Screen of ${device.name}`}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-text-tertiary/30 border-t-brand animate-spin mb-2" />
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-text-tertiary">Conectando</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md backdrop-blur-xl border text-[10px] font-bold tracking-wider uppercase ${isOnline
                        ? 'bg-status-success/20 border-status-success/30 text-status-success shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-status-error/10 border-status-error/20 text-status-error'
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-status-success animate-pulse' : 'bg-status-error'}`} />
                      {isOnline ? 'En Vivo' : 'Offline'}
                    </div>
                  </div>

                  {/* Active App Badge - Enhanced */}
                  {device.activeApp && isOnline && (
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-xl border ${getCategoryColor(getAppCategory(device.activeApp))}`}>
                        <AppWindow className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[10px] font-semibold truncate flex-1" title={device.activeApp}>
                          {device.activeApp}
                        </span>
                        <span className="text-[9px] opacity-70 font-mono shrink-0">AHORA</span>
                      </div>
                    </div>
                  )}

                  {/* Hover Expand Icon */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-2">
                    {!isOnline && (
                      <button 
                        onClick={(e) => deleteDevice(e, device.id)}
                        className="w-7 h-7 rounded-md bg-status-error/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/90 hover:bg-status-error hover:text-white transition-colors"
                        title="Eliminar dispositivo offline"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="w-7 h-7 rounded-md bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Bottom gradient fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-surface-elevated/80 to-transparent pointer-events-none" />
                </div>

                {/* Device Info - Enhanced with animated metrics */}
                <div className="p-4 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-text-primary tracking-tight text-sm leading-tight flex items-center gap-2">
                        @{device.name.toLowerCase()}
                      </h3>
                      <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                        {device.os || 'Windows'} &bull; {device.id.substring(0, 8)}
                      </p>
                    </div>
                  </div>

                  {/* Enhanced Metrics with Progress Bars */}
                  {isOnline && (device.cpu !== undefined || device.ram !== undefined) && (
                    <div className="mt-4 pt-3 border-t border-surface-border/50 space-y-2.5">
                      {/* CPU Bar */}
                      <div className="flex items-center gap-2">
                        <Cpu className={`w-3.5 h-3.5 shrink-0 ${cpuPercent > 80 ? 'text-status-error' : 'text-emerald-500'}`} />
                        <div className="flex-1 h-1.5 bg-surface-border/30 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${cpuColor}`} 
                            style={{ width: `${cpuPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-text-primary w-8 text-right">{cpuPercent}%</span>
                      </div>
                      {/* RAM Bar */}
                      <div className="flex items-center gap-2">
                        <HardDrive className={`w-3.5 h-3.5 shrink-0 ${ramPercent > 85 ? 'text-status-error' : 'text-blue-500'}`} />
                        <div className="flex-1 h-1.5 bg-surface-border/30 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${ramColor}`} 
                            style={{ width: `${ramPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-text-primary w-8 text-right">{ramPercent}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ MODAL FULLSCREEN INTERACTIVO ═══════════ */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl">
          {/* Top Bar */}
          <div className="h-12 sm:h-14 flex items-center justify-between px-3 sm:px-6 border-b border-surface-border shrink-0 bg-surface-base/80 backdrop-blur-xl z-10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className={`w-2 h-2 rounded-full ${remoteState === 'remote' ? 'bg-brand' : 'bg-status-success'}`} />
                {remoteState === 'remote' && <div className="absolute inset-0 w-2 h-2 rounded-full bg-brand animate-ping opacity-75" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-text-primary text-xs sm:text-sm flex items-center gap-2 truncate">
                  @{selectedDevice.name.toLowerCase()}
                  {(remoteState === 'remote' || remoteState === 'terminal') && (
                    <span className="bg-brand/15 text-brand px-2 py-0.5 rounded text-[9px] sm:text-[10px] uppercase font-bold tracking-wider border border-brand/20 shrink-0">
                      {formatTime(sessionTime)}
                    </span>
                  )}
                </h3>
                {selectedDevice.activeApp && (
                  <p className="text-[10px] text-brand mt-0.5 flex items-center gap-1 font-mono">
                    <Terminal className="w-3 h-3" />
                    {selectedDevice.activeApp}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {remoteState === 'remote' && (
                <div className="hidden sm:flex items-center gap-1 bg-surface-base/60 backdrop-blur-md p-1 rounded-lg border border-surface-border">
                  <button
                    onClick={toggleAudioStream}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      isAudioActive 
                        ? 'bg-status-error text-white hover:bg-red-600' 
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                    title={isAudioActive ? 'Detener micrófono' : 'Hablar al equipo'}
                  >
                    <Mic className="w-3.5 h-3.5" /> {isAudioActive ? 'Mic ON' : 'Mic'}
                  </button>
                  <button
                    onClick={handleCtrlAltDel}
                    className="px-3 py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary rounded-md hover:bg-surface-elevated transition-colors flex items-center gap-1.5"
                    title="Enviar Ctrl+Alt+Supr"
                  >
                    <Keyboard className="w-3.5 h-3.5" /> Ctrl+Alt+Del
                  </button>
                  <button
                    onClick={handleToggleHD}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      isHD
                        ? 'bg-brand text-white hover:bg-brand/80'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                    title={isHD ? 'Cambiar a calidad normal (más fluido)' : 'Cambiar a alta calidad (HD)'}
                  >
                    <Video className="w-3.5 h-3.5" /> {isHD ? 'HD ON' : 'HD'}
                  </button>
                  <button
                    onClick={handleEndSession}
                    className="px-3 py-1.5 text-[11px] font-semibold bg-status-error text-white rounded-md transition-colors hover:bg-red-600 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" /> Desconectar
                  </button>
                </div>
              )}
              {remoteState === 'terminal' && (
                <button
                  onClick={handleEndSession}
                  className="px-3 py-1.5 text-[11px] font-bold bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg transition-all flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Cerrar Terminal
                </button>
              )}
              <button
                onClick={closeDeviceModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-colors border border-surface-border"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* ─── Main Area: Interactive Screen ─── */}
            <div
              ref={screenContainerRef}
              className={`flex-1 bg-black relative flex items-center justify-center overflow-hidden touch-none ${remoteState === 'remote' ? 'cursor-none' : ''}`}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              onDoubleClick={handleDblClick}
              onContextMenu={handleContextMenu}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseLeave={() => setShowCursor(false)}
            >
              {/* Connecting Animation */}
              {remoteState === 'connecting' && (
                <div className="flex flex-col items-center text-text-secondary animate-float-up">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 rounded-full border-[3px] border-brand-primary/15 border-t-brand-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-brand-primary" />
                    </div>
                  </div>
                  <span className="uppercase tracking-[0.3em] text-sm font-bold text-brand-primary mb-2">Estableciendo conexión</span>
                  <span className="text-xs text-text-tertiary font-mono">Negociando túnel P2P cifrado...</span>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Reconnecting overlay */}
              {reconnecting && remoteState !== 'connecting' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-yellow-400/30 border-t-yellow-400 animate-spin" />
                    <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Reconectando sesión...</span>
                  </div>
                </div>
              )}

              {/* Terminal View - Real Interactive */}
              {remoteState === 'terminal' && (
                <div className="w-full h-full bg-[#0a0a0e] flex flex-col overflow-hidden">
                  {/* Terminal header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a2e] border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                      </div>
                      <span className="text-[11px] text-white/50 font-mono ml-2">PowerShell - {selectedDevice.name}</span>
                    </div>
                    <span className="text-[10px] text-white/30 font-mono">{selectedDevice.id.substring(0, 12)}</span>
                  </div>

                  {/* Terminal output area */}
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
                    <div className="text-emerald-500/60 text-xs mb-3">
                      VisionControl Remote Terminal v1.0<br />
                      Conectado a {selectedDevice.name} ({selectedDevice.os})<br />
                      <span className="text-white/20">────────────────────────────────────────</span>
                    </div>

                    {terminalOutput.map((line, i) => (
                      <pre
                        key={i}
                        className={`whitespace-pre-wrap break-all text-xs leading-relaxed ${line.isError ? 'text-red-400' : 'text-emerald-300/90'}`}
                      >{line.text}</pre>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>

                  {/* Terminal input */}
                  <form onSubmit={handleTerminalSubmit} className="shrink-0 flex items-center border-t border-white/5 bg-[#0d0d14] px-4 py-3">
                    <span className="text-blue-400 text-xs font-mono mr-2 shrink-0">PS&gt;</span>
                    <input
                      ref={terminalInputRef}
                      type="text"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      className="flex-1 bg-transparent text-emerald-300 text-sm font-mono outline-none placeholder:text-white/20"
                      placeholder="Escribe un comando..."
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="submit"
                      className="ml-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                    >
                      Enviar
                    </button>
                  </form>
                </div>
              )}

              {/* Screen View */}
              {(remoteState === 'none' || remoteState === 'remote') && (
                <>
                  {/* WebRTC Video (preferred, low-latency) */}
                  {webrtcActive && (
                    <video
                      ref={webrtcVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-contain block select-none ${
                        remoteState === 'remote'
                          ? 'opacity-100 ring-2 ring-brand-primary/40 shadow-[0_0_20px_rgba(255,107,53,0.2)]'
                          : 'opacity-80 rounded-xl border border-white/5 shadow-2xl'
                      }`}
                      style={pinchScale > 1 ? {
                        transform: `scale(${pinchScale})`,
                        transformOrigin: `${pinchOrigin.x}% ${pinchOrigin.y}%`,
                      } : undefined}
                    />
                  )}

                  {/* JPEG Fallback (when WebRTC not active) */}
                  {!webrtcActive && screenshots[selectedDevice.id]?.image ? (
                    <img
                      ref={imgRef}
                      src={screenshots[selectedDevice.id]?.image}
                      alt={`Screen of ${selectedDevice.name}`}
                      className={`w-full h-full object-contain block select-none transition-transform duration-150 ${
                        remoteState === 'remote'
                          ? 'opacity-100 ring-2 ring-brand-primary/40 shadow-[0_0_20px_rgba(255,107,53,0.2)]'
                          : 'opacity-70 rounded-xl border border-white/5 shadow-2xl transition-all duration-500'
                        }`}
                      style={pinchScale > 1 ? {
                        transform: `scale(${pinchScale})`,
                        transformOrigin: `${pinchOrigin.x}% ${pinchOrigin.y}%`,
                      } : undefined}
                      draggable={false}
                    />
                  ) : !webrtcActive ? (
                    <div className="flex flex-col items-center text-text-secondary">
                      <Radio className="w-14 h-14 mb-4 text-brand-primary/40 animate-breathe" />
                      <span className="uppercase tracking-[0.25em] text-xs font-bold text-text-tertiary">Esperando Video...</span>
                    </div>
                  ) : null}

                  {/* Tap ripple effect */}
                  {tapRipple && remoteState === 'remote' && (
                    <div
                      key={tapRipple.id}
                      className="absolute pointer-events-none z-[199] animate-ping"
                      style={{ left: tapRipple.x - 12, top: tapRipple.y - 12 }}
                    >
                      <div className="w-6 h-6 rounded-full bg-brand-primary/40 ring-2 ring-brand-primary/60" />
                    </div>
                  )}

                  {/* Remote active border glow */}
                  {remoteState === 'remote' && (
                    <>
                      {showCursor && (
                        <div
                          className="absolute pointer-events-none z-[200] transition-all duration-75 ease-out"
                          style={{ left: cursorPos.x, top: cursorPos.y }}
                        >
                          {/* Mouse pointer SVG icon */}
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_8px_rgba(255,107,53,0.8)]" style={{ transform: 'translate(-2px, -2px)' }}>
                            <path d="M4 2L4 20L8.5 15.5L12.5 22L15 21L11 14L17 14L4 2Z" fill="white" stroke="#FF6B35" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                          {/* Ripple effect on touch */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-brand/40 animate-ping opacity-50" />
                        </div>
                      )}
                      
                      {/* Controles y Metadata del Stream */}
                      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
                        <div className="flex gap-2">
                          <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 pointer-events-auto">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[11px] font-bold text-white tracking-wider">EN VIVO</span>
                          </div>
                          {screenshots[selectedDevice.id]?.metadata && (
                            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 pointer-events-auto">
                              <span className="text-[11px] font-bold text-white/80">
                                {screenshots[selectedDevice.id].metadata.fps} FPS • {screenshots[selectedDevice.id].metadata.quality}% Q
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Selector de Monitor */}
                        {screenshots[selectedDevice.id]?.metadata?.availableMonitors?.length > 1 && (
                          <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 pointer-events-auto">
                            <select 
                              className="bg-transparent text-white text-[11px] font-bold outline-none cursor-pointer"
                              value={screenshots[selectedDevice.id]?.metadata?.monitorId ?? ''}
                              onChange={(e) => {
                                if (socket && selectedDevice) socket.emit('remote:monitor-select', { deviceId: selectedDevice.id, monitorId: e.target.value });
                              }}
                            >
                              {screenshots[selectedDevice.id]?.metadata?.availableMonitors?.map((m: any) => (
                                <option key={m.id} value={m.id} className="bg-bg-elevated text-white">
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto sm:pointer-events-none">
                        {/* Mobile floating toolbar - bigger, easier to use */}
                        <div className="flex items-center gap-3 sm:hidden bg-black/70 backdrop-blur-xl rounded-2xl px-4 py-2.5 border border-white/10">
                          <button
                            onClick={() => {
                              setShowMobileKeyboard(!showMobileKeyboard);
                              setTimeout(() => mobileInputRef.current?.focus(), 100);
                            }}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 ${showMobileKeyboard ? 'bg-brand text-white' : 'bg-white/10 text-white/80'}`}
                          >
                            <Keyboard className="w-5 h-5" />
                          </button>
                          <button
                            onClick={toggleAudioStream}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 ${isAudioActive ? 'bg-status-success text-white' : 'bg-white/10 text-white/80'}`}
                          >
                            <Mic className="w-5 h-5" />
                          </button>
                          <button
                            onClick={handleCtrlAltDel}
                            className="h-11 px-3 rounded-xl bg-white/10 text-white/80 text-[11px] font-bold flex items-center gap-1.5 active:scale-90 transition-transform"
                          >
                            <Shield className="w-4 h-4" /> C+A+D
                          </button>
                          <button
                            onClick={handleEndSession}
                            className="w-11 h-11 rounded-xl bg-status-error text-white flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        {/* Touch hint - compact */}
                        <div className="bg-black/60 backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/5 flex items-center gap-2 pointer-events-none sm:hidden">
                          <Hand className="w-3.5 h-3.5 text-brand-primary" />
                          <span className="text-[10px] text-white/70 font-medium">Tap=clic | Hold=derecho | 2dedos=scroll</span>
                        </div>
                      </div>

                      {/* Mobile keyboard input (hidden but functional) */}
                      {showMobileKeyboard && (
                        <div className="absolute bottom-20 left-4 right-4 sm:hidden pointer-events-auto">
                          <input
                            ref={mobileInputRef}
                            type="text"
                            value={mobileInputText}
                            onInput={handleMobileInput}
                            onKeyDown={handleMobileKeyDown}
                            className="w-full px-4 py-3 bg-black/80 backdrop-blur-xl border border-brand/40 rounded-xl text-white text-sm placeholder:text-white/40 outline-none focus:border-brand"
                            placeholder="Escribe aqui para enviar al PC remoto..."
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div className={`w-full md:w-[340px] bg-surface-base/80 backdrop-blur-xl border-t md:border-t-0 md:border-l border-surface-border flex flex-col shrink-0 md:overflow-hidden ${remoteState === 'remote' ? 'hidden md:flex' : ''}`}>
              {/* Tab Headers */}
              <div className="flex border-b border-surface-border">
                <button
                  onClick={() => setActiveTab('acciones')}
                  className={`flex-1 py-3.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'acciones'
                      ? 'border-brand text-text-primary bg-surface-elevated/50'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                    }`}
                >
                  Acciones
                </button>
                <button
                  onClick={() => setActiveTab('historial')}
                  className={`flex-1 py-3.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'historial'
                      ? 'border-brand text-text-primary bg-surface-elevated/50'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                    }`}
                >
                  Historial
                </button>
                <button
                  onClick={() => setActiveTab('capturas')}
                  className={`flex-1 py-3.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'capturas'
                      ? 'border-brand text-text-primary bg-surface-elevated/50'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                    }`}
                >
                  Capturas
                </button>
              </div>

              <div className="flex-1 md:overflow-y-auto p-5 pb-32 md:pb-5">
                {activeTab === 'acciones' && (
                  <div className="flex flex-col gap-3">
                    {(remoteState === 'remote' || remoteState === 'terminal') ? (
                      <div className="space-y-4">
                        <div className="relative bg-surface-elevated border border-surface-border rounded-xl p-6 text-center">
                          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
                          <div className="w-14 h-14 bg-brand/10 text-brand rounded-xl flex items-center justify-center mx-auto mb-4 border border-brand/20">
                            {remoteState === 'remote' ? <Move className="w-7 h-7" /> : <Terminal className="w-7 h-7" />}
                          </div>
                          <h4 className="text-text-primary font-bold text-lg mb-1">
                            {remoteState === 'remote' ? 'Control Activo' : 'Terminal Activa'}
                          </h4>
                          <p className="text-[12px] text-text-tertiary mb-1 leading-relaxed">
                            {remoteState === 'remote'
                              ? 'Haz clic, escribe y desplázate directamente.'
                              : 'Consola SSH conectada al equipo.'}
                          </p>
                          <div className="text-3xl font-mono font-bold text-brand my-4 tracking-wider">
                            {formatTime(sessionTime)}
                          </div>
                          <p className="text-[10px] text-text-tertiary mb-5 flex items-center justify-center gap-1">
                            <Shield className="w-3 h-3" /> Todas las acciones quedan registradas
                          </p>
                          <button
                            onClick={handleEndSession}
                            className="w-full py-3 bg-status-error text-white rounded-lg text-[13px] font-semibold hover:bg-red-600 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
                          >
                            <Power className="w-4 h-4" /> Finalizar Sesión
                          </button>
                        </div>

                        {remoteState === 'remote' && (
                          <button
                            onClick={handleCtrlAltDel}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-surface-border bg-surface-elevated/30 hover:border-brand/30 hover:bg-brand/5 transition-colors text-left sm:hidden"
                          >
                            <Keyboard className="w-5 h-5 text-brand" />
                            <span className="text-sm font-bold text-text-primary">Ctrl+Alt+Supr</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Action Buttons */}
                        {[
                          { icon: MousePointer2, label: 'Control Remoto', desc: 'Clic, teclado y scroll en tiempo real', action: () => handleStartSession('remote'), reqPerm: 'devices:control' },
                          { icon: Terminal, label: 'Terminal Remota', desc: 'Ejecuta comandos PowerShell en el equipo', action: () => handleStartSession('terminal'), reqPerm: 'devices:control' },
                          { icon: Mic, label: isAudioActive ? 'Detener Escucha' : 'Escucha Activa', desc: isAudioActive ? 'Dejar de transmitir audio' : 'Habla y se escuchará en el equipo remoto', action: toggleAudioStream, reqPerm: 'devices:control', active: isAudioActive },
                        ].filter(item => hasPermission(item.reqPerm)).map((item, i) => (
                          <button
                            key={i}
                            onClick={item.action}
                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 group text-left hover:translate-y-[-1px] active:scale-[0.98] ${
                              (item as any).active
                                ? 'border-brand/50 bg-brand/10 shadow-[0_0_15px_rgba(255,107,53,0.1)]'
                                : 'border-surface-border bg-surface-elevated/30 hover:border-brand/30 hover:bg-brand/5'
                            }`}
                          >
                            <div className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-200 border ${
                              (item as any).active
                                ? 'bg-brand border-brand shadow-lg shadow-brand/20'
                                : 'bg-surface-elevated border-surface-border group-hover:bg-brand group-hover:shadow-lg group-hover:shadow-brand/20 group-hover:border-brand'
                            }`}>
                              <item.icon className={`w-5 h-5 transition-colors duration-300 ${
                                (item as any).active ? 'text-white' : 'text-text-secondary group-hover:text-white'
                              }`} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-text-primary mb-0.5 tracking-tight">{item.label}</div>
                              <div className="text-[11px] text-text-tertiary leading-tight">{item.desc}</div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    <div className="h-px bg-surface-border my-2" />

                    {/* Power Controls — premium redesign */}
                    <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-[0.15em] px-1 mb-2">Control de Energía</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handlePowerOff}
                        className="relative flex flex-col items-center gap-2.5 p-4 rounded-xl border border-status-error/20 bg-gradient-to-b from-status-error/8 to-status-error/3 hover:from-status-error/15 hover:to-status-error/8 hover:border-status-error/40 transition-all duration-200 group active:scale-[0.95] shadow-[0_2px_8px_rgba(239,68,68,0.06)]"
                      >
                        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-status-error/30 to-transparent" />
                        <div className="w-10 h-10 rounded-xl bg-status-error/10 border border-status-error/20 flex items-center justify-center group-hover:bg-status-error/20 transition-colors shadow-inner">
                          <Power className="w-5 h-5 text-status-error" />
                        </div>
                        <span className="text-[11px] font-bold text-status-error tracking-wide">Apagar</span>
                      </button>
                      <button
                        onClick={handleRestart}
                        className="relative flex flex-col items-center gap-2.5 p-4 rounded-xl border border-status-warning/20 bg-gradient-to-b from-status-warning/8 to-status-warning/3 hover:from-status-warning/15 hover:to-status-warning/8 hover:border-status-warning/40 transition-all duration-200 group active:scale-[0.95] shadow-[0_2px_8px_rgba(245,158,11,0.06)]"
                      >
                        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-status-warning/30 to-transparent" />
                        <div className="w-10 h-10 rounded-xl bg-status-warning/10 border border-status-warning/20 flex items-center justify-center group-hover:bg-status-warning/20 transition-colors shadow-inner">
                          <RotateCcw className="w-5 h-5 text-status-warning group-hover:rotate-180 transition-transform duration-500" />
                        </div>
                        <span className="text-[11px] font-bold text-status-warning tracking-wide">Reiniciar</span>
                      </button>
                    </div>

                        <div className="h-px bg-surface-border my-2" />

                        {/* New Boss Actions */}
                        <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-[0.15em] px-1">Acciones de Control</p>

                        {/* Send Toast Message — premium redesign */}
                        <div className="relative rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/8 via-surface-elevated to-surface-elevated overflow-hidden">
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
                          <div className="p-4 space-y-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                                <Video className="w-4 h-4 text-violet-400" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-text-primary block">Enviar Mensaje</span>
                                <span className="text-[10px] text-text-tertiary">Aparece en la pantalla del equipo</span>
                              </div>
                            </div>
                            <input
                              id="toast-msg-input"
                              type="text"
                              placeholder="Ej: Reunión en 5 minutos..."
                              maxLength={80}
                              className="w-full px-3 py-2 bg-surface-base/80 border border-surface-border/80 rounded-xl text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-violet-500/50 focus:bg-surface-elevated transition-all"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const msg = (e.target as HTMLInputElement).value.trim();
                                  if (msg && socket && selectedDevice) {
                                    socket.emit('admin:send-toast', { deviceId: selectedDevice.id, message: msg });
                                    (e.target as HTMLInputElement).value = '';
                                    showNotif('success', 'Mensaje enviado a la pantalla');
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById('toast-msg-input') as HTMLInputElement;
                                const msg = input?.value.trim();
                                if (msg && socket && selectedDevice) {
                                  socket.emit('admin:send-toast', { deviceId: selectedDevice.id, message: msg });
                                  input.value = '';
                                  showNotif('success', 'Mensaje enviado a la pantalla');
                                }
                              }}
                              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-[11px] font-bold transition-all duration-200 hover:shadow-[0_4px_16px_rgba(139,92,246,0.35)] active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              Enviar a Pantalla
                            </button>
                          </div>
                        </div>

                        {/* Force URL */}
                        <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                              <Wifi className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <span className="text-xs font-bold text-text-primary">Forzar Página Web</span>
                          </div>
                          <input
                            id="force-url-input"
                            type="url"
                            placeholder="https://sistema.empresa.com"
                            className="w-full px-2.5 py-1.5 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-blue-500/50"
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById('force-url-input') as HTMLInputElement;
                              const url = input?.value.trim();
                              if (url && socket && selectedDevice) {
                                socket.emit('admin:force-url', { deviceId: selectedDevice.id, url });
                                input.value = '';
                              }
                            }}
                            className="w-full py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-[11px] font-bold hover:bg-blue-500/30 transition-colors active:scale-95"
                          >
                            Abrir en su Navegador
                          </button>
                        </div>

                        {/* Lock Input */}
                        <button
                          onClick={() => {
                            if (socket && selectedDevice) {
                              socket.emit('admin:lock-input', { deviceId: selectedDevice.id });
                            }
                          }}
                          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-status-error/20 bg-status-error/5 hover:bg-status-error/10 hover:border-status-error/40 transition-all group active:scale-[0.98]"
                        >
                          <div className="w-9 h-9 rounded-lg bg-status-error/10 flex items-center justify-center group-hover:bg-status-error/20 transition-colors">
                            <Hand className="w-4 h-4 text-status-error" />
                          </div>
                          <div className="text-left">
                            <div className="text-[12px] font-bold text-status-error">Bloquear Mouse y Teclado</div>
                            <div className="text-[10px] text-text-tertiary">Congela el input del empleado remotamente</div>
                          </div>
                        </button>
                  </div>
                )}

                {activeTab === 'historial' && (
                  <div className="space-y-2 pb-4">
                    {globalReports.filter(r => r.device === selectedDevice.id).length === 0 && (
                      <div className="text-sm text-text-tertiary italic py-6 text-center">Sin actividad registrada aún.</div>
                    )}
                    {globalReports.filter(r => r.device === selectedDevice.id).slice(0, 40).map((log, i, arr) => {
                      const isAlert = log.type === 'Alerta';
                      const isSys = log.type === 'Sistema';
                      const isExcel = log.type === 'Extracción Excel';
                      const dotColor = isAlert ? 'bg-red-500' : isSys ? 'bg-emerald-500' : isExcel ? 'bg-amber-400' : 'bg-brand';
                      const cardBg = isAlert ? 'bg-red-500/5 border-red-500/15' : isExcel ? 'bg-amber-500/5 border-amber-500/15' : 'bg-surface-elevated/40 border-surface-border/50';
                      return (
                        <div key={log.id} className={`relative flex gap-3 p-3 rounded-xl border animate-float-up ${cardBg}`}>
                          <div className="flex flex-col items-center gap-1 pt-0.5">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor} ${i === 0 ? 'shadow-[0_0_8px_currentColor]' : ''}`} />
                            {i < arr.length - 1 && <div className="w-px flex-1 bg-surface-border min-h-[16px]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                isAlert ? 'text-red-400 bg-red-500/10' : isExcel ? 'text-amber-400 bg-amber-500/10' : isSys ? 'text-emerald-400 bg-emerald-500/10' : 'text-brand bg-brand/10'
                              }`}>{log.type}</span>
                              <span className="text-[10px] text-text-tertiary font-mono ml-auto">{new Date(log.date).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-[12px] text-text-primary font-medium leading-snug">{log.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'capturas' && (
                  <div className="space-y-4 pb-4">

                    {/* Inline notification */}
                    {inlineNotif && (
                      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-semibold animate-slide-up ${
                        inlineNotif.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' :
                        inlineNotif.type === 'error' ? 'bg-status-error/10 border-status-error/30 text-status-error' :
                        inlineNotif.type === 'warning' ? 'bg-status-warning/10 border-status-warning/30 text-status-warning' :
                        'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      }`}>
                        {inlineNotif.type === 'success' ? '✓' : inlineNotif.type === 'error' ? '✗' : inlineNotif.type === 'warning' ? '⚠' : 'ℹ'}
                        <span>{inlineNotif.msg}</span>
                      </div>
                    )}

                    {/* Drive status badge */}
                    {driveStatusLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border">
                        <div className="w-3 h-3 rounded-full border border-text-tertiary/30 border-t-brand animate-spin" />
                        <span className="text-[10px] text-text-tertiary">Verificando estado de Drive...</span>
                      </div>
                    ) : driveStatus && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-semibold ${
                        driveStatus.authenticated
                          ? 'bg-status-success/8 border-status-success/25 text-status-success'
                          : driveStatus.enabled
                          ? 'bg-status-warning/8 border-status-warning/25 text-status-warning'
                          : 'bg-surface-elevated border-surface-border text-text-tertiary'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          driveStatus.authenticated ? 'bg-status-success animate-pulse' :
                          driveStatus.enabled ? 'bg-status-warning' : 'bg-text-tertiary/40'
                        }`} />
                        {driveStatus.authenticated
                          ? '✓ Google Drive conectado — capturas guardándose en la nube'
                          : driveStatus.enabled
                          ? '⚠ Drive configurado pero sin autorizar'
                          : 'Drive no configurado — capturas solo en memoria local'}
                      </div>
                    )}

                    {/* Drive Hero Card — when connected */}
                    {(!driveStatus || driveStatus.authenticated) && (
                      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-surface-elevated to-surface-elevated p-5 text-center shadow-[0_0_40px_rgba(59,130,246,0.07)]">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mx-auto mb-3">
                          <HardDrive className="w-7 h-7 text-blue-400" />
                        </div>
                        <h4 className="text-sm font-bold text-text-primary mb-1">Capturas en Google Drive</h4>
                        <p className="text-[11px] text-text-tertiary leading-relaxed mb-4">
                          Cada cambio de app genera una captura guardada <strong className="text-text-secondary">permanentemente</strong> en la nube. Organizadas por dispositivo y fecha.
                        </p>
                        <button
                          onClick={async () => {
                            if (!selectedDevice) return;
                            try {
                              const today = new Date().toISOString().split('T')[0];
                              const res = await api.get(`/drive/folder-url?device=${encodeURIComponent(selectedDevice.name)}&date=${today}`);
                              if (res.data?.url) {
                                window.open(res.data.url, '_blank');
                              } else {
                                showNotif('info', 'Aún no hay capturas para hoy en Drive.');
                              }
                            } catch {
                              showNotif('error', 'No se pudo conectar con Drive. Verifica la configuración.');
                            }
                          }}
                          className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-sm font-bold transition-all duration-200 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] active:scale-95 flex items-center justify-center gap-2"
                        >
                          <HardDrive className="w-4 h-4" />
                          Ver Capturas de Hoy en Drive
                        </button>
                      </div>
                    )}

                    {/* Drive setup card — when not configured */}
                    {driveStatus && !driveStatus.enabled && (
                      <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated p-5">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-text-tertiary/20 to-transparent" />
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-text-tertiary/10 border border-surface-border flex items-center justify-center shrink-0">
                            <HardDrive className="w-5 h-5 text-text-tertiary" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-text-primary mb-0.5">Google Drive no configurado</h4>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">Las capturas se guardan temporalmente en memoria. Configura Drive para archivo permanente.</p>
                          </div>
                        </div>
                        <div className="space-y-1.5 mb-4">
                          {[
                            'Google Cloud Console → Habilitar Drive API',
                            'Crear OAuth2 credentials (Client ID + Secret)',
                            'Agregar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET al servidor',
                            'Visitar /api/drive/auth una vez para autorizar',
                          ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <div className="w-4 h-4 rounded-full bg-surface-border flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-[9px] font-bold text-text-tertiary">{i + 1}</span>
                              </div>
                              <span className="text-[10px] text-text-secondary leading-relaxed">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auth button — when configured but not authorized */}
                    {driveStatus && driveStatus.enabled && !driveStatus.authenticated && (
                      <div className="relative overflow-hidden rounded-2xl border border-status-warning/20 bg-status-warning/5 p-5">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-status-warning/40 to-transparent" />
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-status-warning/15 border border-status-warning/25 flex items-center justify-center shrink-0">
                            <HardDrive className="w-5 h-5 text-status-warning" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-text-primary mb-0.5">Drive pendiente de autorizar</h4>
                            <p className="text-[11px] text-text-tertiary">Credenciales configuradas, solo falta autorizar el acceso.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const serverUrl = getCurrentServerUrl();
                            window.open(`${serverUrl}/api/drive/auth`, '_blank');
                            showNotif('info', 'Se abrió la página de autorización de Google. Completa el proceso allí.');
                          }}
                          className="w-full py-2.5 bg-status-warning/15 border border-status-warning/30 text-status-warning rounded-xl text-xs font-bold hover:bg-status-warning/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Autorizar con Google
                        </button>
                      </div>
                    )}

                    {/* Date filter + load specific day */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Ver capturas por fecha</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={screenshotDate}
                          onChange={e => setScreenshotDate(e.target.value)}
                          className="flex-1 px-3 py-2 bg-surface-elevated border border-surface-border rounded-xl text-xs text-text-primary outline-none focus:border-brand/50 transition-colors"
                        />
                        <button
                          onClick={async () => {
                            if (!selectedDevice) return;
                            if (!driveStatus?.authenticated) {
                              showNotif('warning', 'Drive no está conectado. Configúralo primero.');
                              return;
                            }
                            try {
                              const res = await api.get(`/drive/folder-url?device=${encodeURIComponent(selectedDevice.name)}&date=${screenshotDate}`);
                              if (res.data?.url) window.open(res.data.url, '_blank');
                              else showNotif('info', 'Sin capturas para esa fecha en Drive.');
                            } catch {
                              showNotif('error', 'Error al conectar con Drive.');
                            }
                          }}
                          className="px-4 py-2 bg-surface-elevated border border-surface-border text-text-secondary rounded-xl text-[11px] font-bold hover:border-brand/40 hover:text-brand transition-colors whitespace-nowrap active:scale-95"
                        >
                          Abrir
                        </button>
                      </div>
                    </div>

                    {/* Thumbnails grid if loaded */}
                    {loadingScreenshots ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                      </div>
                    ) : screenshotTimeline.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                        {screenshotTimeline.map((ss) => (
                          <div
                            key={ss.id}
                            className="relative group rounded-xl overflow-hidden border border-surface-border hover:border-blue-500/40 transition-all duration-200 cursor-pointer hover:shadow-[0_0_16px_rgba(59,130,246,0.15)] hover:scale-[1.02]"
                            onClick={() => ss.driveFileId && window.open(`${getCurrentServerUrl()}/api/drive/image/${ss.driveFileId}`, '_blank')}
                          >
                            <img
                              src={ss.driveFileId
                                ? `${getCurrentServerUrl()}/api/drive/image/${ss.driveFileId}`
                                : ss.image || ''
                              }
                              alt={`Captura ${ss.timestamp}`}
                              className="w-full aspect-video object-cover opacity-80 group-hover:opacity-100 transition-opacity bg-surface-elevated"
                              loading="lazy"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-[9px] text-white font-mono font-bold">
                                {ss.timestamp ? new Date(ss.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !loadingScreenshots && driveStatus?.authenticated && (
                        <div className="text-center py-8 text-text-tertiary">
                          <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Sin capturas para esta fecha</p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
