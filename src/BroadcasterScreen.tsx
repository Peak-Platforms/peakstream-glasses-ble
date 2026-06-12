/**
 * BroadcasterScreen.tsx  —  PeakStream POV  (Enhanced Operator Build)
 *
 * Operator-configurable fields:
 *   • Server IP   (used for RTMP ingest)
 *   • Stream Key  (client code / stream key)
 *   • WiFi SSID   (provisioned to glasses over BLE)
 *   • WiFi Pass   (provisioned to glasses over BLE)
 *
 * Protocol auto-detected from URL prefix:
 *   rtmp://...   → RTMP  (uses operator-entered server IP)
 *   https://...  → WebRTC/WHIP  (uses peak.streampal.fun — TLS cert required)
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BluetoothSdk, {DeviceModels} from '@mentra/bluetooth-sdk';
import {useMentraBluetooth, useBluetoothEvent} from '@mentra/bluetooth-sdk/react';

// ── DEFAULTS ────────────────────────────────────────────────────────────────
const DEFAULT_SERVER_IP = '157.245.208.49';
const DEFAULT_STREAM_KEY = 'fancast-1';
const WEBRTC_HOST = 'peak.streampal.fun:8444'; // TLS cert — do not change
const STORAGE_KEY = 'peakstream_pov_config';

// ── VIDEO QUALITY ────────────────────────────────────────────────────────────
const VIDEO_CONFIG = {width: 1280, height: 720, bitrate: 3_000_000, fps: 30};

// ── BRAND COLORS ─────────────────────────────────────────────────────────────
const RED = '#dc2626';
const RED_DARK = '#991b1b';
const BG = '#0a0a0a';
const BG2 = '#111111';
const BORDER = 'rgba(220,38,38,0.15)';

interface Config {
  serverIp: string;
  streamKey: string;
  wifiSsid: string;
  wifiPass: string;
  protocol: 'rtmp' | 'webrtc';
}

const DEFAULT_CONFIG: Config = {
  serverIp: DEFAULT_SERVER_IP,
  streamKey: DEFAULT_STREAM_KEY,
  wifiSsid: '',
  wifiPass: '',
  protocol: 'rtmp',
};

function buildStreamUrl(cfg: Config): string {
  const key = cfg.streamKey.trim() || DEFAULT_STREAM_KEY;
  if (cfg.protocol === 'webrtc') {
    return `https://${WEBRTC_HOST}/${key}/whip`;
  }
  const ip = cfg.serverIp.trim() || DEFAULT_SERVER_IP;
  return `rtmp://${ip}:1935/live/${key}`;
}

export default function BroadcasterScreen() {
  const mentra = useMentraBluetooth();
  const connected = mentra?.glasses?.connected ?? false;

  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState('');
  const [wifiSending, setWifiSending] = useState(false);

  const streamIdRef = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Config>;
          setCfg(prev => ({...prev, ...saved}));
          if (saved.streamKey) setShowSettings(false);
          else setShowSettings(true);
        } else {
          setShowSettings(true);
        }
      })
      .catch(() => setShowSettings(true));
  }, []);

  const saveConfig = useCallback(async (newCfg: Config) => {
    setCfg(newCfg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newCfg));
    setShowSettings(false);
    setStatus('Settings saved');
  }, []);

  useBluetoothEvent('stream_status', (e: any) => {
    const s = e?.status ?? e?.state ?? JSON.stringify(e);
    setStatus(String(s));
    if (s === 'error' || s === 'stopped') {
      setLive(false);
      streamIdRef.current = null;
    }
  });

  const connectGlasses = useCallback(async () => {
    try {
      setBusy(true);
      setStatus('Scanning for glasses…');
      const devices = await BluetoothSdk.scan(DeviceModels.MentraLive, {timeoutMs: 12000});
      if (!devices?.length) { setStatus('No glasses found — power on and retry'); return; }
      await BluetoothSdk.connect(devices[0]);
      setStatus('Glasses connected');
    } catch (err: any) {
      setStatus(`Connect failed: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const sendWifi = useCallback(async () => {
    const ssid = cfg.wifiSsid.trim();
    const pass = cfg.wifiPass.trim();
    if (!ssid) { Alert.alert('WiFi SSID required', 'Enter the WiFi network name first.'); return; }
    if (!connected) { Alert.alert('Not connected', 'Connect glasses before sending WiFi credentials.'); return; }
    try {
      setWifiSending(true);
      setStatus('Sending WiFi to glasses…');
      await BluetoothSdk.sendWifiCredentials(ssid, pass);
      setStatus('WiFi credentials sent');
    } catch (err: any) {
      setStatus(`WiFi send failed: ${err?.message ?? err}`);
    } finally {
      setWifiSending(false);
    }
  }, [cfg.wifiSsid, cfg.wifiPass, connected]);

  const goLive = useCallback(async () => {
    try {
      setBusy(true);
      const streamId = `pov-${Date.now()}`;
      streamIdRef.current = streamId;
      await BluetoothSdk.startStream({
        type: 'start_stream',
        streamUrl: buildStreamUrl(cfg),
        streamId,
        video: VIDEO_CONFIG,
      });
      setLive(true);
      setStatus(`Live · ${cfg.protocol.toUpperCase()}`);
    } catch (err: any) {
      setStatus(`Start failed: ${err?.message ?? err}`);
      streamIdRef.current = null;
    } finally {
      setBusy(false);
    }
  }, [cfg]);

  const stopLive = useCallback(async () => {
    streamIdRef.current = null;
    try { await BluetoothSdk.stopStream(); } catch {}
    setLive(false);
    setStatus('Stopped');
  }, []);

  useEffect(() => () => { stopLive(); }, [stopLive]);

  if (showSettings) return <SettingsScreen cfg={cfg} onSave={saveConfig} />;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.titlePeak}>PEAK</Text>
        <Text style={styles.titleStream}>STREAM</Text>
        <Text style={styles.titlePov}> POV</Text>
      </View>
      <Text style={styles.subtitle}>A PEAK PLATFORMS PRODUCT</Text>

      {/* Status */}
      <View style={[styles.statusPill, live && styles.statusPillLive]}>
        <Text style={[styles.statusText, live && styles.statusTextLive]}>
          {status || (connected ? 'Ready' : 'Not connected')}
        </Text>
      </View>

      <Text style={styles.keyLabel}>
        {cfg.streamKey || DEFAULT_STREAM_KEY} · {cfg.protocol.toUpperCase()}
      </Text>

      {!connected ? (
        <Pressable style={styles.btn} onPress={connectGlasses} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Connecting…' : '🕶 Connect Glasses'}</Text>
        </Pressable>
      ) : !live ? (
        <>
          {cfg.wifiSsid.trim().length > 0 && (
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={sendWifi} disabled={wifiSending}>
              <Text style={styles.btnText}>{wifiSending ? 'Sending WiFi…' : '📶 Send WiFi to Glasses'}</Text>
            </Pressable>
          )}
          <View style={styles.toggleRow}>
            {(['rtmp', 'webrtc'] as const).map(p => (
              <Pressable key={p}
                style={[styles.toggle, cfg.protocol === p && styles.toggleActive]}
                onPress={() => setCfg(prev => ({...prev, protocol: p}))}>
                <Text style={[styles.toggleText, cfg.protocol === p && styles.toggleTextActive]}>
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.btn} onPress={goLive} disabled={busy}>
            <Text style={styles.btnText}>{busy ? 'Starting…' : '● GO LIVE'}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={[styles.btn, styles.btnStop]} onPress={stopLive}>
          <Text style={styles.btnText}>⬛ STOP</Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator style={{marginTop: 16}} color={RED} />}

      {!live && (
        <Pressable style={styles.settingsLink} onPress={() => setShowSettings(true)}>
          <Text style={styles.settingsLinkText}>⚙ Settings</Text>
        </Pressable>
      )}
    </View>
  );
}

function SettingsScreen({cfg, onSave}: {cfg: Config; onSave: (c: Config) => void}) {
  const [local, setLocal] = useState<Config>({...cfg});
  const set = (key: keyof Config) => (val: string) => setLocal(prev => ({...prev, [key]: val}));

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: BG}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={settings.container}>

        {/* Header */}
        <View style={settings.headerRow}>
          <Text style={settings.titlePeak}>PEAK</Text>
          <Text style={settings.titleStream}>STREAM</Text>
          <Text style={settings.titlePov}> POV</Text>
        </View>
        <Text style={settings.subtitle}>A PEAK PLATFORMS PRODUCT</Text>

        <Text style={settings.section}>Operator Setup</Text>

        {/* Server — conditional on protocol */}
        {local.protocol === 'rtmp' ? (
          <>
            <Text style={settings.label}>RTMP SERVER IP</Text>
            <TextInput style={settings.input} value={local.serverIp}
              onChangeText={set('serverIp')} placeholder={DEFAULT_SERVER_IP}
              placeholderTextColor="#555" autoCapitalize="none" keyboardType="numeric" />
          </>
        ) : (
          <>
            <Text style={settings.label}>WEBRTC SERVER</Text>
            <View style={settings.readOnly}>
              <Text style={settings.readOnlyText}>{WEBRTC_HOST}</Text>
            </View>
          </>
        )}

        <Text style={settings.label}>STREAM KEY</Text>
        <TextInput style={settings.input} value={local.streamKey}
          onChangeText={set('streamKey')} placeholder="e.g. camera1"
          placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false} />

        <Text style={settings.section}>WiFi for Glasses</Text>
        <Text style={settings.hint}>
          Glasses stream over WiFi — not Bluetooth. Enter the network credentials
          then tap "Send WiFi to Glasses" after connecting.
        </Text>

        <Text style={settings.label}>WIFI NETWORK (SSID)</Text>
        <TextInput style={settings.input} value={local.wifiSsid}
          onChangeText={set('wifiSsid')} placeholder="Network name"
          placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false} />

        <Text style={settings.label}>WIFI PASSWORD</Text>
        <TextInput style={settings.input} value={local.wifiPass}
          onChangeText={set('wifiPass')} placeholder="Password"
          placeholderTextColor="#555" secureTextEntry autoCapitalize="none" autoCorrect={false} />

        <Text style={settings.label}>DEFAULT PROTOCOL</Text>
        <View style={settings.toggleRow}>
          {(['rtmp', 'webrtc'] as const).map(p => (
            <Pressable key={p}
              style={[settings.toggle, local.protocol === p && settings.toggleActive]}
              onPress={() => setLocal(prev => ({...prev, protocol: p}))}>
              <Text style={[settings.toggleText, local.protocol === p && settings.toggleTextActive]}>
                {p.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={settings.urlPreview}>→ {buildStreamUrl(local)}</Text>

        <Pressable style={settings.saveBtn} onPress={() => onSave(local)}>
          <Text style={settings.saveBtnText}>SAVE & CONTINUE</Text>
        </Pressable>

        <Text style={settings.footer}>Peak Platforms · XSEN · PeakStream POV</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── MAIN STYLES ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {flex:1, alignItems:'center', justifyContent:'center', padding:28, gap:16, backgroundColor:BG},
  header: {flexDirection:'row', alignItems:'baseline'},
  titlePeak: {fontSize:36, fontWeight:'900', color:'#ffffff'},
  titleStream: {fontSize:36, fontWeight:'900', color:'#ffffff'},
  titlePov: {fontSize:36, fontWeight:'900', color:RED},
  subtitle: {fontSize:10, color:'#555', letterSpacing:2, textTransform:'uppercase', marginTop:-8},
  statusPill: {backgroundColor:BG2, borderWidth:1, borderColor:BORDER, borderRadius:20, paddingVertical:6, paddingHorizontal:16},
  statusPillLive: {borderColor:RED, backgroundColor:'rgba(220,38,38,0.1)'},
  statusText: {fontSize:13, color:'#555', textAlign:'center'},
  statusTextLive: {color:RED, fontWeight:'700'},
  keyLabel: {fontSize:11, color:'#333', fontFamily:'monospace'},
  btn: {backgroundColor:RED, paddingVertical:16, paddingHorizontal:40, borderRadius:8, minWidth:240, alignItems:'center'},
  btnSecondary: {backgroundColor:RED_DARK},
  btnStop: {backgroundColor:'#1a1a1a', borderWidth:2, borderColor:RED},
  btnText: {color:'#fff', fontSize:16, fontWeight:'800', letterSpacing:1},
  toggleRow: {flexDirection:'row', gap:8},
  toggle: {paddingVertical:8, paddingHorizontal:24, borderRadius:6, borderWidth:1, borderColor:RED},
  toggleActive: {backgroundColor:RED},
  toggleText: {color:RED, fontWeight:'700'},
  toggleTextActive: {color:'#fff'},
  settingsLink: {marginTop:8},
  settingsLinkText: {color:'#333', fontSize:13},
});

// ── SETTINGS STYLES ───────────────────────────────────────────────────────────
const settings = StyleSheet.create({
  container: {padding:28, gap:8, backgroundColor:BG, flexGrow:1},
  headerRow: {flexDirection:'row', alignItems:'baseline', justifyContent:'center', marginBottom:2},
  titlePeak: {fontSize:28, fontWeight:'900', color:'#ffffff'},
  titleStream: {fontSize:28, fontWeight:'900', color:'#ffffff'},
  titlePov: {fontSize:28, fontWeight:'900', color:RED},
  subtitle: {fontSize:10, color:'#555', letterSpacing:2, textTransform:'uppercase', textAlign:'center', marginBottom:20},
  section: {fontSize:11, fontWeight:'700', color:RED, letterSpacing:1.5, textTransform:'uppercase', marginTop:16, marginBottom:4},
  hint: {fontSize:11, color:'#444', lineHeight:16, marginBottom:8},
  label: {fontSize:10, fontWeight:'600', color:'#555', letterSpacing:1, textTransform:'uppercase', marginTop:12, marginBottom:4},
  input: {backgroundColor:BG2, borderWidth:1, borderColor:'rgba(220,38,38,0.2)', borderRadius:8, padding:14, fontSize:15, color:'#f1f5f9'},
  readOnly: {backgroundColor:BG2, borderWidth:1, borderColor:'rgba(220,38,38,0.2)', borderRadius:8, padding:14},
  readOnlyText: {fontSize:15, color:'#555'},
  toggleRow: {flexDirection:'row', gap:8, marginTop:4},
  toggle: {flex:1, paddingVertical:10, borderRadius:6, borderWidth:1, borderColor:RED, alignItems:'center'},
  toggleActive: {backgroundColor:RED},
  toggleText: {color:RED, fontWeight:'700'},
  toggleTextActive: {color:'#fff'},
  urlPreview: {fontSize:10, color:'#333', fontFamily:'monospace', marginTop:8, marginBottom:4},
  saveBtn: {backgroundColor:RED, paddingVertical:16, borderRadius:8, alignItems:'center', marginTop:24},
  saveBtnText: {color:'#fff', fontSize:16, fontWeight:'800', letterSpacing:1},
  footer: {fontSize:10, color:'#222', textAlign:'center', letterSpacing:1, textTransform:'uppercase', marginTop:24},
});
