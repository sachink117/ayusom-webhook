import AIChatbot from "@/components/AIChatbot";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-green-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌿</span>
            <div>
              <h1 className="text-xl font-bold text-green-900 tracking-tight">Ayusomam Herbals</h1>
              <p className="text-xs text-green-700 font-medium">Root-Cause Ayurvedic Healing</p>
            </div>
          </div>
          <button className="bg-green-700 hover:bg-green-800 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-md shadow-green-700/20 hidden md:block">
            Start Free Assessment
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center pt-40 pb-20 px-6 text-center">
        <div className="inline-block bg-green-100/50 border border-green-200 text-green-800 px-4 py-1.5 rounded-full text-sm font-semibold mb-8">
          ✨ Trusted by 10,000+ Patients
        </div>
        
        <h2 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight max-w-4xl leading-tight mb-8">
          Cure your Sinusitis at the <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">Root Dosha Level.</span>
        </h2>
        
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-12 leading-relaxed">
          Stop relying on temporary nasal sprays and anti-allergics. Our 14-Day Deep Healing Protocol uses classical <strong>Shalakya Tantra</strong> to permanently clear blockages and repair your nasal lining.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full text-left mt-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md hover:-translate-y-1">
            <div className="text-4xl mb-4">💨</div>
            <h3 className="font-bold text-xl text-slate-900 mb-2">Nitric Oxide Breathing</h3>
            <p className="text-slate-500">Advanced pranayama techniques to forcefully open blockages and boost healing.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md hover:-translate-y-1">
            <div className="text-4xl mb-4">🌿</div>
            <h3 className="font-bold text-xl text-slate-900 mb-2">Herbal Formulation</h3>
            <p className="text-slate-500">Targeted Kadhas and Nasyas specific to your strict Kaphaja/Pittaja profile.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md hover:-translate-y-1">
            <div className="text-4xl mb-4">👨‍⚕️</div>
            <h3 className="font-bold text-xl text-slate-900 mb-2">Expert 1-on-1 Guidance</h3>
            <p className="text-slate-500">Daily routine adjustments personally tracked via WhatsApp by Sachin Ji.</p>
          </div>
        </div>
      </main>

      {/* Chatbot Overlay */}
      <AIChatbot />
    </div>
  );
}
