import { Redirect, Route, Switch } from "wouter";
import "./App.css";
import { motion } from "motion/react";
import { cn } from "./lib/utils";
import Category from "./pages/category";
import HomePage from "./pages/home";
import PdfPage from "./pages/pdf";
import { useSettings } from "./stores/settings";
import DragAndDropZone from "./templates/drag-and-drop";
import Navbar from "./templates/navbar";
import Sidebar from "./templates/sidebar";

function App() {
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar);
  return (
    <>
      <Navbar />
      <motion.div
        onDragStart={(e) => e.preventDefault()}
        onDragEnd={(e) => e.preventDefault()}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        className={cn("grid gap-12 h-full bg-morphing-50 text-morphing-900")}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          gap: showNavigationSidebar ? 48 : 0,
          gridTemplateColumns: showNavigationSidebar ? "260px 1fr" : "0px 1fr",
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.3,
        }}
        layout="position"
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
          <Route path="/settings" key={"settings-page"}></Route>
          <Route path="/trash" key={"trash-page"}></Route>
          <Route path="/info" key={"info-page"}></Route>
          <Route path="*" key={"not-found-page"}>
            <Redirect to="/" />
          </Route>
        </Switch>
      </motion.div>
    </>
  );
}

export default App;
