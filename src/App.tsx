/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { Redirect, Route, Switch } from "wouter";
import "./App.css";
import Category from "./pages/category";
import HomePage from "./pages/home";
import DragAndDropZone from "./templates/drag-and-drop";
import Navbar from "./templates/navbar";
import Sidebar from "./templates/sidebar";
import PdfPage from "./pages/pdf";

function App() {
  return (
    <>
      <Navbar />
      <div
        onDragStart={(e) => e.preventDefault()}
        onDragEnd={(e) => e.preventDefault()}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        className="grid grid-cols-[260px_1fr] gap-12 h-full bg-morphing-50 text-morphing-900"
      >
        <Sidebar />
        <Switch>
          <Route path="/" key={"home-page"}>
            <DragAndDropZone>
              <HomePage />
            </DragAndDropZone>
          </Route>
          <Route path="/home" key={"settings-page"}>
            <Redirect to="/" />
          </Route>
          <Route path="/category/:categoryId" key={"category-page"}>
            <DragAndDropZone className="overflow-y-auto pb-48 px-8">
              <Category />
            </DragAndDropZone>
          </Route>
          <Route path="/category/:categoryId/:pdfId" key={"pdf-page"}>
            <PdfPage />
          </Route>
        </Switch>
      </div>
    </>
  );
}

export default App;
