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
 *
 * Settings persisted via AsyncStorage — only need to enter once.
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

// ── CONFIG TYPE ───────────────────────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
function buildStreamUrl(cfg: Config): string {
  const key = cfg.streamKey.trim() || DEFAULT_STREAM_KEY;
  if (cfg.protocol === 'webrtc') {
    return `https://${WEBRTC_HOST}/${key}/whip`;
  }
  const ip = cfg.serverIp.trim() || DEFAULT_SERVER_IP;
  return `rtmp://${ip}:1935/live/${key}`;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────
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

  // ── LOAD SAVED CONFIG ──────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Config>;
          setCfg(prev => ({...prev, ...saved}));
          // If we have settings, skip the settings screen
          if (saved.streamKey) setShowSettings(false);
          else setShowSettings(true);
        } else {
          setShowSettings(true); // First launch — show settings
        }
      })
      .catch(() => setShowSettings(true));
  }, []);

  // ── SAVE CONFIG ────────────────────────────────────────────────────────────
  const saveConfig = useCallback(async (newCfg: Config) => {
    setCfg(newCfg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newCfg));
    setShowSettings(false);
    setStatus('Settings saved');
  }, []);

  // ── STREAM EVENTS ──────────────────────────────────────────────────────────
  useBluetoothEvent('stream_status', (e: any) => {
    const s = e?.status ?? e?.state ?? JSON.stringify(e);
    setStatus(String(s));
    if (s === 'error' || s === 'stopped') {
      setLive(false);
      streamIdRef.current = null;
    }
  });

  // ── CONNECT GLASSES ────────────────────────────────────────────────────────
  const connectGlasses = useCallback(async () => {
    try {
      setBusy(true);
      setStatus('Scanning for glasses…');
      const devices = await BluetoothSdk.scan(DeviceModels.MentraLive, {
        timeoutMs: 12000,
      });
      if (!devices?.length) {
        setStatus('No glasses found — power on glasses and retry');
        return;
      }
      await BluetoothSdk.connect(devices[0]);
      setStatus('Glasses connected');
    } catch (err: any) {
      setStatus(`Connect failed: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }, []);

  // ── SEND WIFI TO GLASSES ───────────────────────────────────────────────────
  const sendWifi = useCallback(async () => {
    const ssid = cfg.wifiSsid.trim();
    const pass = cfg.wifiPass.trim();
    if (!ssid) {
      Alert.alert('WiFi SSID required', 'Enter the WiFi network name first.');
      return;
    }
    if (!connected) {
      Alert.alert('Not connected', 'Connect glasses before sending WiFi credentials.');
      return;
    }
    try {
      setWifiSending(true);
      setStatus('Sending WiFi to glasses…');
      await BluetoothSdk.sendWifiCredentials(ssid, pass);
      setStatus('WiFi credentials sent — glasses connecting to network');
    } catch (err: any) {
      setStatus(`WiFi send failed: ${err?.message ?? err}`);
    } finally {
      setWifiSending(false);
    }
  }, [cfg.wifiSsid, cfg.wifiPass, connected]);

  // ── GO LIVE ────────────────────────────────────────────────────────────────
  const goLive = useCallback(async () => {
    try {
      setBusy(true);
      const streamId = `pov-${Date.now()}`;
      streamIdRef.current = streamId;
      const url = buildStreamUrl(cfg);

      await BluetoothSdk.startStream({
        type: 'start_stream',
        streamUrl: url,
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

  // ── STOP ───────────────────────────────────────────────────────────────────
  const stopLive = useCallback(async () => {
    streamIdRef.current = null;
    try {
      await BluetoothSdk.stopStream();
    } catch {
      // already stopped
    }
    setLive(false);
    setStatus('Stopped');
  }, []);

  useEffect(() => () => { stopLive(); }, [stopLive]);

  // ── SETTINGS SCREEN ────────────────────────────────────────────────────────
  if (showSettings) {
    return <SettingsScreen cfg={cfg} onSave={saveConfig} />;
  }

  // ── MAIN SCREEN ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PeakStream POV</Text>
        <Text style={styles.subtitle}>A Peak Platforms Product</Text>
      </View>

      {/* Status pill */}
      <View style={[styles.statusPill, live && styles.statusPillLive]}>
        <Text style={[styles.statusText, live && styles.statusTextLive]}>
          {status || (connected ? 'Ready' : 'Not connected')}
        </Text>
      </View>

      {/* Stream key display */}
      <Text style={styles.keyLabel}>
        {cfg.streamKey || DEFAULT_STREAM_KEY} · {cfg.protocol.toUpperCase()}
      </Text>

      {/* Action buttons */}
      {!connected ? (
        <Pressable
          style={styles.btn}
          onPress={connectGlasses}
          disabled={busy}>
          <Text style={styles.btnText}>
            {busy ? 'Connecting…' : '🕶 Connect Glasses'}
          </Text>
        </Pressable>
      ) : !live ? (
        <>
          {/* WiFi send button — only show if SSID is configured */}
          {cfg.wifiSsid.trim().length > 0 && (
            <Pressable
              style={[styles.btn, styles.btnWifi]}
              onPress={sendWifi}
              disabled={wifiSending}>
              <Text style={styles.btnText}>
                {wifiSending ? 'Sending WiFi…' : '📶 Send WiFi to Glasses'}
              </Text>
            </Pressable>
          )}

          {/* Protocol toggle */}
          <View style={styles.toggleRow}>
            {(['rtmp', 'webrtc'] as const).map(p => (
              <Pressable
                key={p}
                style={[styles.toggle, cfg.protocol === p && styles.toggleActive]}
                onPress={() => setCfg(prev => ({...prev, protocol: p}))}>
                <Text
                  style={[
                    styles.toggleText,
                    cfg.protocol === p && styles.toggleTextActive,
                  ]}>
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.btn} onPress={goLive} disabled={busy}>
            <Text style={styles.btnText}>
              {busy ? 'Starting…' : '● Go Live'}
            </Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={[styles.btn, styles.btnStop]} onPress={stopLive}>
          <Text style={styles.btnText}>⬛ Stop</Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator style={{marginTop: 16}} color="#2563eb" />}

      {/* Settings gear */}
      {!live && (
        <Pressable
          style={styles.settingsLink}
          onPress={() => setShowSettings(true)}>
          <Text style={styles.settingsLinkText}>⚙ Settings</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── SETTINGS SCREEN COMPONENT ─────────────────────────────────────────────────
function SettingsScreen({
  cfg,
  onSave,
}: {
  cfg: Config;
  onSave: (c: Config) => void;
}) {
  const [local, setLocal] = useState<Config>({...cfg});

  const set = (key: keyof Config) => (val: string) =>
    setLocal(prev => ({...prev, [key]: val}));

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={settings.container}>
        <Text style={settings.title}>PeakStream POV</Text>
        <Text style={settings.subtitle}>A Peak Platforms Product</Text>
        <Text style={settings.section}>Operator Setup</Text>

        {/* Server IP */}
        <Text style={settings.label}>RTMP SERVER IP</Text>
        <TextInput
          style={settings.input}
          value={local.serverIp}
          onChangeText={set('serverIp')}
          placeholder={DEFAULT_SERVER_IP}
          placeholderTextColor="#334155"
          autoCapitalize="none"
          keyboardType="numeric"
        />

        {/* Stream Key */}
        <Text style={settings.label}>STREAM KEY</Text>
        <TextInput
          style={settings.input}
          value={local.streamKey}
          onChangeText={set('streamKey')}
          placeholder="e.g. camera1, fancast-1"
          placeholderTextColor="#334155"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={settings.section}>WiFi for Glasses</Text>
        <Text style={settings.hint}>
          Glasses stream over WiFi — not Bluetooth. Enter the network
          credentials then tap "Send WiFi to Glasses" after connecting.
        </Text>

        {/* WiFi SSID */}
        <Text style={settings.label}>WIFI NETWORK (SSID)</Text>
        <TextInput
          style={settings.input}
          value={local.wifiSsid}
          onChangeText={set('wifiSsid')}
          placeholder="Network name"
          placeholderTextColor="#334155"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* WiFi Password */}
        <Text style={settings.label}>WIFI PASSWORD</Text>
        <TextInput
          style={settings.input}
          value={local.wifiPass}
          onChangeText={set('wifiPass')}
          placeholder="Password"
          placeholderTextColor="#334155"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Default protocol */}
        <Text style={settings.label}>DEFAULT PROTOCOL</Text>
        <View style={settings.toggleRow}>
          {(['rtmp', 'webrtc'] as const).map(p => (
            <Pressable
              key={p}
              style={[
                settings.toggle,
                local.protocol === p && settings.toggleActive,
              ]}
              onPress={() => setLocal(prev => ({...prev, protocol: p}))}>
              <Text
                style={[
                  settings.toggleText,
                  local.protocol === p && settings.toggleTextActive,
                ]}>
                {p.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Preview URL */}
        <Text style={settings.urlPreview}>
          → {buildStreamUrl(local)}
        </Text>

        {/* Save */}
        <Pressable
          style={settings.saveBtn}
          onPress={() => onSave(local)}>
          <Text style={settings.saveBtnText}>Save & Continue</Text>
        </Pressable>

        <Text style={settings.footer}>
          Peak Platforms · XSEN · PeakStream POV
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
    backgroundColor: '#06080a',
  },
  header: {alignItems: 'center', gap: 4},
  title: {fontSize: 30, fontWeight: '800', color: '#f1f5f9'},
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statusPill: {
    backgroundColor: '#0d1014',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  statusPillLive: {
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  statusText: {fontSize: 13, color: '#64748b', textAlign: 'center'},
  statusTextLive: {color: '#ef4444', fontWeight: '700'},
  keyLabel: {fontSize: 11, color: '#334155', fontFamily: 'monospace'},
  btn: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 240,
    alignItems: 'center',
  },
  btnWifi: {backgroundColor: '#0f766e'},
  btnStop: {backgroundColor: '#b91c1c'},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  toggleRow: {flexDirection: 'row', gap: 8},
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  toggleActive: {backgroundColor: '#2563eb'},
  toggleText: {color: '#2563eb', fontWeight: '600'},
  toggleTextActive: {color: '#fff'},
  settingsLink: {marginTop: 8},
  settingsLinkText: {color: '#334155', fontSize: 13},
});

const settings = StyleSheet.create({
  container: {
    padding: 28,
    gap: 8,
    backgroundColor: '#06080a',
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0d1014',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#f1f5f9',
  },
  toggleRow: {flexDirection: 'row', gap: 8, marginTop: 4},
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    alignItems: 'center',
  },
  toggleActive: {backgroundColor: '#2563eb'},
  toggleText: {color: '#2563eb', fontWeight: '600'},
  toggleTextActive: {color: '#fff'},
  urlPreview: {
    fontSize: 10,
    color: '#334155',
    fontFamily: 'monospace',
    marginTop: 8,
    marginBottom: 4,
  },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  footer: {
    fontSize: 10,
    color: '#1e293b',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
  },
});



