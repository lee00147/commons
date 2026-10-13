import { useEffect } from 'react'
import { Rates } from './sections/Rates'
import { Header, Hero, WhitePaper, Cmn, HowItWorks, CommonsApp, Developers, Roadmap, Footer } from './sections/Site'
import { Live } from './sections/Live'

export default function App() {
  // Links like /#how arrive before the sections exist; jump once they do.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant' })
  }, [])
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Live />
        <Rates />
        <WhitePaper />
        <Cmn />
        <HowItWorks />
        <Developers />
        <CommonsApp />
        <Roadmap />
      </main>
      <Footer />
    </>
  )
}
