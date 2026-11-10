import { mapAvailability } from '../arSupport';

test('RF-01 mapea los estados de ARCore', () => {
  expect(mapAvailability('SUPPORTED')).toBe('supported');
  expect(mapAvailability('UNSUPPORTED')).toBe('unsupported');
  expect(mapAvailability('TRANSIENT')).toBe('transient');
  expect(mapAvailability('UNKNOWN')).toBe('unknown');
  expect(mapAvailability('SUPPORTED_APK_TOO_OLD')).toBe('needsInstall');
});
