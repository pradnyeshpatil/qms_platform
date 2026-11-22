import { Reveal, SectionHead, StatusChip, spotlight } from './ui'

const D = [
  ['D0', 'Prepare', 'Decide if an 8D is needed and take emergency action.'],
  ['D1', 'Form the team', 'Bring together the people who know the product and process.'],
  ['D2', 'Describe the problem', 'State what, where, when and how big — in measurable terms.'],
  ['D3', 'Contain', 'Stop the customer being hit again while you investigate.'],
  ['D4', 'Find the root cause', 'Prove why it happened and why it escaped detection.'],
  ['D5', 'Choose corrective actions', 'Pick the fixes that remove the root cause.'],
  ['D6', 'Implement & validate', 'Roll the fix out and confirm it works.'],
  ['D7', 'Prevent recurrence', 'Update procedures, FMEAs and training across similar products.'],
  ['D8', 'Close & recognise', 'Approve the report and thank the team.'],
] as const

export function EightD() {
  return (
    <section id="eight-d" className="bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead eyebrow="The 8D method" title={<>Problem solving your OEM customers <span className="lp-grad-text">already expect</span></>} sub="8D is the standard way manufacturers investigate and report quality problems. We turn it into guided steps instead of a spreadsheet." />
        <div className="mt-6 flex justify-center"><Reveal delay={200}><StatusChip live={false} /></Reveal></div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {D.map(([code, title, text], i) => (
            <Reveal key={code} delay={(i % 3) * 90} variant={i % 3 === 0 ? 'left' : i % 3 === 2 ? 'right' : 'up'}>
              <div onMouseMove={spotlight} className="lp-spot h-full rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <span className="lp-grad-text text-5xl font-black">{code}</span>
                <h3 className="mt-3 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
