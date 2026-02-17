"use client";

import React from "react";

interface NavbarProps {
  currentView: "library" | "highlights";
  onViewChange: (view: "library" | "highlights") => void;
}

export default function Navbar({ currentView, onViewChange }: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="logo-icon">📚</span>
        <span className="logo-text">BookApp</span>
      </div>
      <div className="navbar-links">
        <button
          className={`nav-link ${currentView === "library" ? "active" : ""}`}
          onClick={() => onViewChange("library")}
        >
          Library
        </button>
        <button
          className={`nav-link ${currentView === "highlights" ? "active" : ""}`}
          onClick={() => onViewChange("highlights")}
        >
          All Highlights
        </button>
      </div>
    </nav>
  );
}
