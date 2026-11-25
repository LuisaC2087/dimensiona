import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { homeFor, useAuth } from '../state/auth';
import { Loading } from '../components/ui';
import { colors } from '../theme';

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>;
  return <Redirect href={user ? homeFor(user.role) : '/login'} />;
}
