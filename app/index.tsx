import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View
} from 'react-native';

const LAPTOP_IP = '172.20.10.2';
const WS_PORT = '8080';
const REAL_HISTORICAL_DATA = [1.2, 1.4, 1.1, 1.8, 2.5, 5.1, 4.8, 3.9, 2.8, 2.1, 1.7, 1.5, 1.3, 1.2, 1.1];

interface SensorNode {
  id: string;
  name: string;
  type: 'Seismic' | 'Hydrological' | 'TDR Soil';
  location: string;
  latency: string;
  status: 'Healthy' | 'Warning' | 'Offline';
  isPingable: boolean;
}

const INITIAL_NODES: SensorNode[] = [
  { id: 'ST-04', name: 'ST04-Malang', type: 'Seismic', location: 'Kab. Malang Selatan', latency: '12ms', status: 'Healthy', isPingable: false },
  { id: 'WD-02', name: 'WD02-Pasuruan', type: 'Hydrological', location: 'DAS Rejoso Pasuruan', latency: '45ms', status: 'Healthy', isPingable: false },
  { id: 'TDR-01', name: 'TDR01-Batu', type: 'TDR Soil', location: 'Lereng Payung Batu', latency: '320ms', status: 'Warning', isPingable: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('console');
  const [systemAlert, setSystemAlert] = useState<boolean>(false);
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<'live' | 'historical'>('live');
  const [seismicData, setSeismicData] = useState<number[]>(Array(15).fill(1.2));
  const [nodes, setNodes] = useState<SensorNode[]>(INITIAL_NODES);
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [xmlTab, setXmlTab] = useState<'human' | 'raw'>('human');

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (dataSource === 'historical') {
      setSeismicData(REAL_HISTORICAL_DATA);
      if (wsRef.current) wsRef.current.close();
      return;
    }

    const wsUrl = `ws://${LAPTOP_IP}:${WS_PORT}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setServerConnected(true);
      console.log('Connected to I-DEWS Backend Gateway Server');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'TELEMETRY') {
          setSeismicData((prev) => {
            const next = [...prev.slice(1)];
            next.push(payload.value);
            return next;
          });
        } else if (payload.type === 'SYSTEM_STATUS') {
          setSystemAlert(payload.alert);
        }
      } catch (err) {
        console.log('Error parsing socket data:', err);
      }
    };

    ws.onclose = () => {
      setServerConnected(false);
      console.log('Disconnected from server');
    };

    ws.onerror = (e) => {
      console.log('WebSocket Error:', e);
    };

    return () => {
      ws.close();
    };
  }, [dataSource]);

  useEffect(() => {
    if (systemAlert) {
      Vibration.vibrate([100, 200, 100, 200, 100, 200, 500, 1000], true);
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [systemAlert]);

  const calculateSTALTA = () => {
    if (seismicData.length < 10) return { ratio: 1.0, isTriggered: false };
    
    const staWindow = seismicData.slice(-3);
    const staSquareSum = staWindow.reduce((acc, val) => acc + (val * val), 0);
    const sta = staSquareSum / staWindow.length;

    const ltaWindow = seismicData.slice(0, 10);
    const ltaSquareSum = ltaWindow.reduce((acc, val) => acc + (val * val), 0);
    const lta = ltaSquareSum / ltaWindow.length;

    const ratio = lta === 0 ? 1.0 : parseFloat((sta / lta).toFixed(2));
    return { ratio, isTriggered: ratio > 3.5 };
  };

  const { ratio: staLtaRatio, isTriggered: algorithmDetected } = calculateSTALTA();

  const toggleSirenBroadcast = () => {
    const nextAlertState = !systemAlert;
    setSystemAlert(nextAlertState);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TRIGGER_CAO_OVERRIDE',
        active: nextAlertState
      }));
    }
  };

  const pingIndividualNode = (nodeId: string) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => (n.id === nodeId ? { ...n, isPingable: true } : n))
    );

    setTimeout(() => {
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          if (n.id === nodeId) {
            const randomLatency = Math.floor(10 + Math.random() * 80);
            const randomStatus = randomLatency > 70 ? 'Warning' : 'Healthy';
            return {
              ...n,
              latency: `${randomLatency}ms`,
              status: randomStatus as any,
              isPingable: false,
            };
          }
          return n;
        })
      );
    }, 1500);
  };

  const currentSeismic = seismicData[seismicData.length - 1];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen options={{ headerShown: false }} />

      {systemAlert && (
        <View style={styles.sirenOverlay}>
          <View style={styles.sirenCard}>
            <Ionicons name="warning" size={80} color="#FF3B30" style={styles.sirenIcon} />
            <Text style={styles.sirenTitle}>CRITICAL ALERT OVERRIDE ACTIVE</Text>
            <Text style={styles.sirenSubtitle}>Seismic Amplitude: {currentSeismic} Richter</Text>
            <Text style={styles.sirenDesc}>
              A critical anomaly has been detected. Broadcast Common Alerting Protocol (CAP v1.2 XML) across the network.
            </Text>
            <TouchableOpacity style={styles.dismissButton} onPress={toggleSirenBroadcast}>
              <Text style={styles.dismissButtonText}>MUTED & STOP BROADCAST</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>I-DEWS MONITORING SYSTEM</Text>
          <Text style={styles.headerTitle}>
            {activeTab === 'console' && 'Control Console'}
            {activeTab === 'nodes' && 'Nodes Manager'}
            {activeTab === 'logs' && 'CAP Protocols'}
          </Text>
        </View>
        <View style={[styles.statusBadge, serverConnected && styles.statusBadgeConnected]}>
          <View style={[styles.statusDot, { backgroundColor: serverConnected ? '#34C759' : '#8E8E93' }]} />
          <Text style={[styles.statusText, { color: serverConnected ? '#34C759' : '#8E8E93' }]}>
            {serverConnected ? 'SERVER OK' : 'LOCAL SIM'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {activeTab === 'console' && (
          <View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity 
                style={[styles.toggleButton, dataSource === 'live' && styles.toggleActive]}
                onPress={() => setDataSource('live')}
              >
                <Ionicons name="radio-outline" size={16} color={dataSource === 'live' ? '#0A0A0A' : '#DEFF9A'} />
                <Text style={[styles.toggleText, dataSource === 'live' && styles.toggleTextActive]}>Live Stream</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.toggleButton, dataSource === 'historical' && styles.toggleActive]}
                onPress={() => setDataSource('historical')}
              >
                <Ionicons name="archive-outline" size={16} color={dataSource === 'historical' ? '#0A0A0A' : '#DEFF9A'} />
                <Text style={[styles.toggleText, dataSource === 'historical' && styles.toggleTextActive]}>Malang 2022 (Static)</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Live Telemetry Wave</Text>
            <View style={styles.graphContainer}>
              <View style={styles.graphHeader}>
                <View style={styles.row}>
                  <Ionicons name="pulse" size={20} color="#DEFF9A" />
                  <Text style={styles.graphTitle}>Seismic Wave Analyzer (ST04)</Text>
                </View>
                <Text style={[styles.graphValue, { color: systemAlert ? '#FF4D4D' : '#DEFF9A' }]}>
                  {currentSeismic} R
                </Text>
              </View>

              <View style={styles.waveVisualizer}>
                {seismicData.map((val, idx) => {
                  const barHeight = (val / 10) * 100;
                  return (
                    <View 
                      key={idx} 
                      style={[
                        styles.waveBar, 
                        { 
                          height: `${Math.max(barHeight, 5)}%`,
                          backgroundColor: systemAlert ? '#FF3B30' : '#DEFF9A',
                          opacity: 0.3 + (idx / 15) * 0.7
                        }
                      ]} 
                    />
                  );
                })}
              </View>

              <View style={styles.graphFooter}>
                <Text style={styles.footerMicroText}>STA/LTA Ratio: {staLtaRatio}</Text>
                <Text style={[styles.footerMicroText, { color: algorithmDetected ? '#FF3B30' : '#888' }]}>
                  {algorithmDetected ? 'ALGORITHM TRIGGERED' : 'SIGNAL CALM'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Digital Signal Analysis</Text>
            <View style={styles.analysisCard}>
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>STA Window (3 sample)</Text>
                <Text style={styles.analysisValue}>{((seismicData.slice(-3).reduce((a, b) => a + b, 0)) / 3).toFixed(2)} R</Text>
              </View>
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>LTA Window (10 sample)</Text>
                <Text style={styles.analysisValue}>{((seismicData.slice(0, 10).reduce((a, b) => a + b, 0)) / 10).toFixed(2)} R</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>BSN STA/LTA Algorithm</Text>
                <Text style={[styles.analysisValue, { color: algorithmDetected ? '#FF3B30' : '#34C759' }]}> 
                  {algorithmDetected ? 'EMERGENCY ANOMALY' : 'NORMAL (SAFE)'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Manual Broadcast Override</Text>
            <View style={styles.controlBox}>
              <View style={styles.controlHeader}>
                <Ionicons name="shield-checkmark" size={24} color="#FF4D4D" />
                <Text style={styles.controlTitle}>Critical Alert Override (CAO)</Text>
              </View>
              <Text style={styles.controlDesc}>
                Force registered mobile clients to sound the alarm at maximum volume, bypassing Silent and DND modes according to ISO 22328.
              </Text>
              <TouchableOpacity 
                style={[styles.button, { backgroundColor: systemAlert ? '#222' : '#FF3B30' }]}
                onPress={toggleSirenBroadcast}
              >
                <Ionicons name="radio" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>{systemAlert ? 'MUTED ALARM' : 'SIMULATE CRITICAL ATTACK'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'nodes' && (
          <View style={{ marginTop: 15 }}>
            <Text style={styles.sectionSubtitleText}>Active Field Sensors (SNI 8235:2017)</Text>
            {nodes.map((node) => (
              <View key={node.id} style={styles.nodeCard}>
                <View style={styles.nodeHeader}>
                  <View style={styles.row}>
                    <Ionicons 
                      name={node.type === 'Seismic' ? 'pulse' : node.type === 'Hydrological' ? 'water' : 'leaf'} 
                      size={24} 
                      color="#DEFF9A" 
                    />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.nodeName}>{node.name}</Text>
                      <Text style={styles.nodeLocation}>{node.location}</Text>
                    </View>
                  </View>
                  <View style={[styles.badge, node.status === 'Healthy' ? styles.badgeGreen : styles.badgeYellow]}>
                    <Text style={node.status === 'Healthy' ? styles.badgeTextGreen : styles.badgeTextYellow}>
                      {node.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.nodeFooter}>
                  <Text style={styles.nodeMeta}>Latency: {node.latency}</Text>
                  <TouchableOpacity 
                    style={styles.pingButton} 
                    onPress={() => pingIndividualNode(node.id)}
                    disabled={node.isPingable}
                  >
                    {node.isPingable ? (
                      <Text style={styles.pingText}>Pinging...</Text>
                    ) : (
                      <>
                        <Ionicons name="wifi-outline" size={14} color="#DEFF9A" style={{ marginRight: 4 }} />
                        <Text style={styles.pingText}>Ping Node</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'logs' && (
          <View style={{ marginTop: 15 }}>
            <Text style={styles.sectionSubtitleText}>XML Protocol Decoder (CAP v1.2 Standard)</Text>
            
            <View style={styles.logCard}>
              <TouchableOpacity 
                style={styles.logHeader}
                onPress={() => setExpandedLogId(expandedLogId === 'cap-1' ? null : 'cap-1')}
              >
                <View>
                  <Text style={styles.logMeta}>CAP-2026-001 [18:41:20]</Text>
                  <Text style={styles.logTitle}>Earthquake Detection (P-Wave Trigger)</Text>
                </View>
                <Ionicons 
                  name={expandedLogId === 'cap-1' ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color="#888" 
                />
              </TouchableOpacity>

              {expandedLogId === 'cap-1' && (
                <View style={styles.logBody}>
                  <View style={styles.xmlTabContainer}>
                    <TouchableOpacity 
                      style={[styles.xmlTab, xmlTab === 'human' && styles.xmlTabActive]}
                      onPress={() => setXmlTab('human')}
                    >
                      <Text style={[styles.xmlTabText, xmlTab === 'human' && styles.xmlTabTextActive]}>Human View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.xmlTab, xmlTab === 'raw' && styles.xmlTabActive]}
                      onPress={() => setXmlTab('raw')}
                    >
                      <Text style={[styles.xmlTabText, xmlTab === 'raw' && styles.xmlTabTextActive]}>Raw (XML)</Text>
                    </TouchableOpacity>
                  </View>

                  {xmlTab === 'human' ? (
                    <View style={styles.decodedContainer}>
                      <View style={styles.decodedRow}>
                        <Text style={styles.decodedLabel}>Threat Status:</Text>
                        <Text style={[styles.decodedValue, { color: '#FF3B30', fontWeight: 'bold' }]}>KRITIS / SEVERE</Text>
                      </View>
                      <View style={styles.decodedRow}>
                        <Text style={styles.decodedLabel}>Area Location:</Text>
                        <Text style={styles.decodedValue}>South Coast Malang, East Java</Text>
                      </View>
                      <View style={styles.decodedRow}>
                        <Text style={styles.decodedLabel}>Recommended Action:</Text>
                        <Text style={[styles.decodedValue, { color: '#DEFF9A' }]}>Move inland immediately and evacuate to higher ground.</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.codeBlock}>
                      <Text style={styles.codeText}>
                        {`<?xml version="1.0" encoding="UTF-8"?>\n<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">\n  <identifier>BMKG-2026-ST04</identifier>\n  <sender>bmkg.go.id</sender>\n  <status>Actual</status>\n  <msgType>Alert</msgType>\n  <scope>Public</scope>\n  <info>\n    <category>Geo</category>\n    <event>Earthquake</event>\n    <urgency>Immediate</urgency>\n    <severity>Severe</severity>\n    <area>\n      <areaDesc>South Coast Malang</areaDesc>\n    </area>\n  </info>\n</alert>`}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('console')}>
          <Ionicons name="pulse" size={24} color={activeTab === 'console' ? '#DEFF9A' : '#555'} />
          <Text style={[styles.navText, { color: activeTab === 'console' ? '#DEFF9A' : '#555' }]}>Console</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('nodes')}>
          <Ionicons name="server" size={24} color={activeTab === 'nodes' ? '#DEFF9A' : '#555'} />
          <Text style={[styles.navText, { color: activeTab === 'nodes' ? '#DEFF9A' : '#555' }]}>Nodes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('logs')}>
          <Ionicons name="terminal" size={24} color={activeTab === 'logs' ? '#DEFF9A' : '#555'} />
          <Text style={[styles.navText, { color: activeTab === 'logs' ? '#DEFF9A' : '#555' }]}>CAP Logs</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  statusBadgeConnected: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    padding: 4,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: '#DEFF9A',
  },
  toggleText: {
    color: '#DEFF9A',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#0A0A0A',
  },
  sectionTitle: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 25,
    marginBottom: 10,
  },
  sectionSubtitleText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 15,
  },
  graphContainer: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  graphTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  graphValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  waveVisualizer: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    padding: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  waveBar: {
    width: '5%',
    borderRadius: 3,
  },
  graphFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  footerMicroText: {
    color: '#555',
    fontSize: 10,
    fontWeight: '600',
  },
  analysisCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  analysisLabel: {
    color: '#888',
    fontSize: 13,
  },
  analysisValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#1F1F1F',
    marginVertical: 10,
  },
  controlBox: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  controlTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
  controlDesc: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  nodeCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  nodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nodeName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  nodeLocation: {
    color: '#555',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeGreen: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  badgeYellow: {
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  badgeTextGreen: {
    color: '#34C759',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextYellow: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: '700',
  },
  nodeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    marginTop: 15,
    paddingTop: 12,
  },
  nodeMeta: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  pingText: {
    color: '#DEFF9A',
    fontSize: 11,
    fontWeight: '600',
  },
  logCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  logMeta: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  logTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  logBody: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    backgroundColor: '#0F0F0F',
  },
  xmlTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 3,
    marginBottom: 15,
  },
  xmlTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 6,
  },
  xmlTabActive: {
    backgroundColor: '#3A3A3C',
  },
  xmlTabText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  xmlTabTextActive: {
    color: '#FFF',
  },
  decodedContainer: {
    gap: 12,
  },
  decodedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  decodedLabel: {
    color: '#888',
    fontSize: 13,
    width: '40%',
  },
  decodedValue: {
    color: '#FFF',
    fontSize: 13,
    width: '60%',
    textAlign: 'right',
  },
  codeBlock: {
    backgroundColor: '#050505',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  codeText: {
    color: '#34C759',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 75,
    backgroundColor: '#0F0F0F',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 15,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  sirenOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sirenCard: {
    width: '100%',
    backgroundColor: '#1A0808',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  sirenIcon: {
    marginBottom: 20,
  },
  sirenTitle: {
    color: '#FF3B30',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 10,
  },
  sirenSubtitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  sirenDesc: {
    color: '#FFAAAA',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 30,
  },
  dismissButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  }
});