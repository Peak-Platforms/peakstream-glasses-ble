import React from 'react';
import {StatusBar, Text, ScrollView} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import BroadcasterScreen from './src/BroadcasterScreen';

// Catches any render-time error and shows it on screen instead of crashing.
class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {error: Error | null}
> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{flex: 1, backgroundColor: '#330000'}}
          contentContainerStyle={{padding: 24}}>
          <Text style={{color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12}}>
            App error
          </Text>
          <Text style={{color: '#ffdddd', fontSize: 13}}>
            {String(this.state.error?.message ?? this.state.error)}
          </Text>
          <Text style={{color: '#ffaaaa', fontSize: 11, marginTop: 16}}>
            {String(this.state.error?.stack ?? '')}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{flex: 1, backgroundColor: '#fff'}} edges={['top']}>
        <ErrorBoundary>
          <BroadcasterScreen />
        </ErrorBoundary>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
