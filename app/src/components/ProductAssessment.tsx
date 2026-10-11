import { useQuery } from '@tanstack/react-query'
import { assessProduct, gradeDescriptions, type AssessmentFactor } from '../../../shared/product-assessment'
import { getPublicProduct } from '../lib/public-food'
import { numberFormat } from '../lib/nutrition'
import { Button, Notice, errorMessage } from './ui'

function Factors({ items, positive }: { items: AssessmentFactor[]; positive: boolean }) {
  if (!items.length) return <p className="source-credit">Baza nie podaje szczegółów.</p>
  return <ul className="assessment-factors">{items.map((item) => <li key={item.name}>
    <span>{item.name}{item.value !== null && item.unit && <small>{numberFormat.format(item.value)} {item.unit}</small>}</span>
    <strong>{item.points > 0 ? positive ? '+' : '−' : ''}{item.points} pkt</strong>
  </li>)}</ul>
}

/** A separate public lookup also covers products found in the bundled catalogue or private saved foods. Nothing is added to the diary. */
export function ProductAssessment({ barcode, searchError, onRetry }: { barcode: string; searchError?: string | null; onRetry?: () => void }) {
  const query = useQuery({
    queryKey: ['product-assessment', barcode.padStart(14, '0')],
    queryFn: async () => {
      const product = await getPublicProduct(barcode)
      return product ? assessProduct(product, barcode) : null
    },
    staleTime: 300_000, retry: false, networkMode: 'always',
  })
  if (query.isPending) return <p className="assessment-status" role="status">Sprawdzam ocenę produktu…</p>
  if (query.isError) return <div className="assessment-unavailable">
    {searchError === errorMessage(query.error)
      ? <p className="source-credit">Nie udało się sprawdzić oceny — odczyt korzysta z tej samej niedostępnej bazy.</p>
      : <Notice tone="error">Nie udało się sprawdzić oceny. {errorMessage(query.error)} Możesz nadal dodać produkt do dziennika.</Notice>}
    <Button type="button" variant="secondary" busy={query.isFetching} onClick={() => { onRetry?.(); void query.refetch() }}>Ponów sprawdzenie oceny</Button>
  </div>
  const product = query.data
  if (!product) return <Notice>Brak oceny — tego kodu nie ma w Open Food Facts. Nie oceniamy podobnego produktu na oko.</Notice>
  const { rating } = product
  return <section className={`product-assessment${rating ? ` assessment-${rating.grade}` : ''}`} aria-label="Ocena produktu">
    <div className="assessment-heading">
      <div><h3>{product.name}</h3>{product.brand && <p className="source-credit">{product.brand}</p>}</div>
      {rating ? <div className="assessment-score" aria-label={`Ocena Flexa: ${rating.score} na 100`}>
        <strong>{rating.score}</strong><span>/ 100</span>
      </div> : <strong className="assessment-no-score">Brak oceny</strong>}
    </div>
    {rating ? <>
      <p className="assessment-verdict">{gradeDescriptions[rating.grade]}</p>
      <p className="source-credit">Na podstawie Nutri-Score {rating.grade.toUpperCase()} (algorytm 2023). {rating.estimated
        ? 'Baza oznacza dane użyte w ocenie jako szacunkowe.' : 'Wynik z danych w publicznej bazie — porównaj je z etykietą.'}</p>
    </> : <p className="source-credit">Brak kompletnych, zgodnych danych Nutri-Score 2023 dla produktu w sprzedaży. Nie zgadujemy wyniku z samych kalorii ani starszej oceny.</p>}
    <p className="assessment-caution">To ocena profilu odżywczego, nie bezpieczeństwa ani dopasowania do Twojej diety. Porównuj podobne produkty; porcja też ma znaczenie.</p>
    <details className="assessment-details">
      <summary>{rating ? 'Dlaczego taki wynik? Skład i alergeny' : 'Sprawdź skład i alergeny'}</summary>
      {rating && <>
        <div className="assessment-breakdown">
          <div><h4>Punkty ujemne Nutri-Score</h4><Factors items={rating.negative} positive={false} /></div>
          <div><h4>Punkty dodatnie Nutri-Score</h4><Factors items={rating.positive} positive /></div>
        </div>
        <p className="source-credit">Wartości dotyczą 100 g lub 100 ml produktu; procenty oznaczają udział składników. Nutri-Score odejmuje punkty dodatnie od ujemnych — wynik źródłowy: {rating.rawScore}. To nie punkty skali Flexa.</p>
        <p className="source-credit">Skala Flexa v1: A → 81–100, B → 61–80, C → 41–60, D → 21–40, E → 1–20. W każdej klasie przeliczamy wynik źródłowy liniowo: im niższy, tym wyższa ocena. Napoje i tłuszcze mają osobne progi; woda ma 100. To nasze przeliczenie, nie oficjalna skala Nutri-Score ani algorytm „Zdrowych Zakupów”.</p>
        <p className="source-credit">Nie oceniamy toksyczności dodatków ani obecności pestycydów. Wynik 100 nie oznacza, że produkt jest odpowiedni dla każdego.</p>
      </>}
      <h4>Alergeny według bazy</h4>
      <p>{product.allergens.length ? product.allergens.join(', ') : 'Baza nie wymienia alergenów — to nie potwierdza ich braku.'}</p>
      {product.traces.length > 0 && <p>Może zawierać: {product.traces.join(', ')}.</p>}
      <p className="source-credit">Przy alergii zawsze sprawdź opakowanie, także ostrzeżenie o śladowych ilościach.</p>
      <h4>Skład według bazy</h4>
      <p className="assessment-ingredients">{product.ingredients ?? 'Brak listy składników w bazie.'}</p>
      <p className="source-credit"><a href={`https://world.openfoodfacts.org/product/${product.barcode}`} target="_blank" rel="noreferrer">Zobacz lub popraw dane w Open Food Facts</a> · ODbL</p>
    </details>
  </section>
}
