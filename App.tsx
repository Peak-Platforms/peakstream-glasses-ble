import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import BroadcasterScreen from './src/BroadcasterScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{flex: 1, backgroundColor: '#fff'}} edges={['top']}>
        <BroadcasterScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
