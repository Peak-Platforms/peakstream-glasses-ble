/**
 * BroadcasterScreen.tsx
 * Minimal PeakStream POV broadcaster — one screen, two buttons.
 *
 * Supports BOTH WebRTC (WHIP) and RTMP from the SAME build:
 * the Mentra SDK picks the protocol automatically from the URL prefix.
 *     rtmp://...   -> RTMP
 *     https://...  -> WebRTC (WHIP)
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, Pressable, StyleSheet, ActivityIndicator} from 'react-native';
import BluetoothSdk, {DeviceModels} from '@mentra/bluetooth-sdk';
import {useMentraBluetooth, useBluetoothEvent} from '@mentra/bluetooth-sdk/react';

// ---- CONFIG: change these now, or later swap for a Supabase fetch ----
const STREAM_KEY = 'fancast-1';
const ENDPOINTS = {
  rtmp: `rtmp://157.245.208.49:1935/live/${STREAM_KEY}`,
  webrtc: `https://peak.streampal.fun:8444/${STREAM_KEY}/whip`,
};
// ----------------------------------------------------------------------

export default function BroadcasterScreen() {
  const mentra = useMentraBluetooth();
  // Defensive: SDK state may be undefined on the very first render.
  const connected = mentra?.glasses?.connected ?? false;

  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState('');
  const [protocol, setProtocol] = useState<'rtmp' | 'webrtc'>('rtmp');

  const streamIdRef = useRef<string | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useBluetoothEvent('stream_status', (e: any) => {
    const s = e?.status ?? e?.state ?? JSON.stringify(e);
    setStatus(String(s));
    if (s === 'error' || s === 'stopped') stopLive();
  });

  const connectGlasses = useCallback(async () => {
    try {
      setBusy(true);
      setStatus('Scanning…');
      const devices = await BluetoothSdk.scan(DeviceModels.MentraLive, {
        timeoutMs: 10000,
      });
      if (!devices || !devices.length) {
        setStatus('No glasses found');
        return;
      }
      await BluetoothSdk.connect(devices[0]);
      setStatus('Connected');
    } catch (err: any) {
      setStatus(`Connect failed: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const goLive = useCallback(async () => {
    try {
      setBusy(true);
      const streamId = `rn-${Date.now()}`;
      streamIdRef.current = streamId;

      await BluetoothSdk.startStream({
        type: 'start_stream',
        streamUrl: ENDPOINTS[protocol],
        streamId,
      });

      keepAliveRef.current = setInterval(() => {
        if (streamIdRef.current) {
          BluetoothSdk.keepStreamAlive({
            type: 'keep_stream_alive',
            streamId: streamIdRef.current,
            ackId: `ack-${Date.now()}`,
          });
        }
      }, 15000);

      setLive(true);
      setStatus(`Live (${protocol.toUpperCase()})`);
    } catch (err: any) {
      setStatus(`Start failed: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }, [protocol]);

  const stopLive = useCallback(async () => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    streamIdRef.current = null;
    try {
      await BluetoothSdk.stopStream();
    } catch {
      // already stopped
    }
    setLive(false);
    setStatus('Stopped');
  }, []);

  useEffect(() => () => stopLive(), [stopLive]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PeakStream POV</Text>
      <Text style={styles.status}>
        {status || (connected ? 'Ready' : 'Not connected')}
      </Text>

      {!connected ? (
        <Pressable style={styles.button} onPress={connectGlasses} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? 'Connecting…' : 'Connect Glasses'}
          </Text>
        </Pressable>
      ) : !live ? (
        <>
          <View style={styles.toggleRow}>
            {(['rtmp', 'webrtc'] as const).map(p => (
              <Pressable
                key={p}
                style={[styles.toggle, protocol === p && styles.toggleActive]}
                onPress={() => setProtocol(p)}>
                <Text
                  style={[
                    styles.toggleText,
                    protocol === p && styles.toggleTextActive,
                  ]}>
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.button} onPress={goLive} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Starting…' : 'Go Live'}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={[styles.button, styles.stop]} onPress={stopLive}>
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator style={{marginTop: 16}} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {fontSize: 28, fontWeight: '700'},
  status: {fontSize: 16, opacity: 0.7, textAlign: 'center'},
  button: {
    backgroundColor: '#1e63ff',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  stop: {backgroundColor: '#dd3333'},
  buttonText: {color: '#fff', fontSize: 18, fontWeight: '600'},
  toggleRow: {flexDirection: 'row', gap: 8},
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e63ff',
  },
  toggleActive: {backgroundColor: '#1e63ff'},
  toggleText: {color: '#1e63ff', fontWeight: '600'},
  toggleTextActive: {color: '#fff'},
});
