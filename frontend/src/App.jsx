import './App.css'
import CustomerScreen from './CustomerScreen'

function App() {
  return (
    <div className="w-full">
      <h1 className="text-4xl font-bold text-white mb-8 text-center bg-gradient-to-br from-gray-900 to-gray-800 p-8">
        Game & Music Store
      </h1>
      <CustomerScreen />
    </div>
  )
}

export default App
