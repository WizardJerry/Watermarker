import "./App.css"; // 引入包含 Tailwind 的样式
import WatermarkPage from "./components/watermarker"; // 引入你新建的组件

function App() {
  return (
    <div className="App">
      {/* 这里直接渲染水印页面组件。
        如果未来你有多个页面（比如路由），也是在这里配置。
      */}
      <WatermarkPage />
    </div>
  );
}

export default App;