/** Documentos legales (fuente única en el servidor). Renderiza Markdown simple. */
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../api/client';
import { ErrorBox, Header, Loading, Screen } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';
import { parseMarkdown, type MdInline } from '../../lib/markdown';
import { colors, fonts, space } from '../../theme';

function Inline({ parts }: { parts: MdInline[] }) {
  return <>{parts.map((p, i) => <Text key={i} style={p.bold ? { fontWeight: '800' } : undefined}>{p.text}</Text>)}</>;
}

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { data, error, loading, reload } = useLoad(() => api.legal(doc), [doc]);
  const blocks = data ? parseMarkdown(data.markdown) : [];
  return (
    <Screen header={<Header title={doc === 'privacidad' ? 'Tus datos' : 'Términos'} kicker={data ? `Versión ${data.version}` : 'Legal'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return b.level === 1
            ? <Text key={i} style={{ fontFamily: fonts.display, fontSize: 30, textTransform: 'uppercase', color: colors.ink }}><Inline parts={b.parts} /></Text>
            : <View key={i} style={{ borderLeftWidth: 8, borderColor: colors.red, paddingLeft: space.sm, marginTop: space.sm }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 20, textTransform: 'uppercase', color: colors.ink }}><Inline parts={b.parts} /></Text>
            </View>;
        }
        if (b.type === 'li') {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingLeft: space.sm, marginTop: -space.sm }}>
              <Text style={{ color: colors.red, fontWeight: '900' }}>{b.ordered ? `${b.n}.` : '■'}</Text>
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.ink }}><Inline parts={b.parts} /></Text>
            </View>
          );
        }
        return <Text key={i} style={{ fontSize: 15, lineHeight: 23, color: colors.ink }}><Inline parts={b.parts} /></Text>;
      })}
    </Screen>
  );
}
