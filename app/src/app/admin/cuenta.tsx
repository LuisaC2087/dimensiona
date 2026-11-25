import { router } from 'expo-router';
import { AccountScreen } from '../../components/AccountScreen';

export default function AdminCuenta() {
  return <AccountScreen onBack={() => router.back()} />;
}
