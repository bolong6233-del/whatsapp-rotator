import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Navbar */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💬</span>
              <span className="font-bold text-xl text-gray-900">无敌牛子</span>
            </div>
            <div className="flex gap-4">
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                免费注册
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <span>🚀</span>
            <span>专为广告营销设计</span>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            牛子智能
            <span className="text-green-500">分流系统</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            一个短链接，绑定多个 WhatsApp 号码，自动循环分配客户流量。
            轻松管理多个客服号码，提升广告投放效率。
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/register"
              className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors shadow-lg hover:shadow-xl"
            >
              免费开始使用 →
            </Link>
            <Link
              href="/login"
              className="bg-white hover:bg-gray-50 text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold transition-colors shadow-lg border border-gray-200"
            >
              已有账号？登录
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">核心功能</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🔗</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">短链生成</h3>
              <p className="text-gray-600">
                自定义短链后缀，生成简洁易记的专属链接，方便在广告素材中使用。
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">智能轮询</h3>
              <p className="text-gray-600">
                访客点击短链时自动轮流分配到不同 WhatsApp 号码，均衡分流，避免单号过载。
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">数据统计</h3>
              <p className="text-gray-600">
                实时追踪点击量、来源、地区等数据，每个号码的接待量一目了然。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">使用流程</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '1', title: '注册账号', desc: '免费注册，立即使用' },
              { step: '2', title: '创建短链', desc: '自定义短链后缀' },
              { step: '3', title: '添加号码', desc: '绑定多个 WhatsApp' },
              { step: '4', title: '投放推广', desc: '分享短链，自动分流' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  {item.step}
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4 text-center">
        <p>© 2024 无敌牛子. 保留所有权利.</p>
      </footer>
    </div>
  )
}
