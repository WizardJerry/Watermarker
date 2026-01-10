import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
    Upload,
    File as FileIcon,
    Settings,
    Plus,
    Save,
    Edit3,
    ChevronDown,
    X,
    CheckCircle2,
    Sparkles
} from 'lucide-react';

interface UploadedFile {
    name: string;
    path: string;
    size: number;
}

const WatermarkPage: React.FC = () => {
    // -----------------------
    // State & Logic
    // -----------------------
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [watermarkText, setWatermarkText] = useState<string>("");
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [selectedConfig, setSelectedConfig] = useState<string>("default");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial dummy data for visual testing if empty (Optional, removed for production feel)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) {
            const droppedFiles = Array.from(e.dataTransfer.files).map(f => ({
                name: f.name,
                path: (f as any).path || f.name,
                size: f.size
            }));
            setFiles(prev => [...prev, ...droppedFiles]);
        }
    };

    // Tauri Drag & Drop Listeners
    useEffect(() => {
        const unlistenDrop = listen<{ paths: string[], position: { x: number, y: number } }>('tauri://drag-drop', (event) => {
            const payload = event.payload;
            const paths = payload.paths || (Array.isArray(payload) ? payload : []);

            if (paths && paths.length > 0) {
                const newFiles = paths.map(path => {
                    const name = path.split(/[/\\]/).pop() || path;
                    return {
                        name: name,
                        path: path,
                        size: 0
                    };
                });
                setFiles(prev => [...prev, ...newFiles]);
                setIsDragging(false);
            }
        });

        const unlistenEnter = listen('tauri://drag-enter', () => {
            setIsDragging(true);
        });

        const unlistenLeave = listen('tauri://drag-leave', () => {
            setIsDragging(false);
        });

        return () => {
            unlistenDrop.then(f => f());
            unlistenEnter.then(f => f());
            unlistenLeave.then(f => f());
        };
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files).map(f => ({
                name: f.name,
                path: (f as any).path || f.name,
                size: f.size
            }));
            setFiles(prev => [...prev, ...selectedFiles]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
        // Global Container: Dark Theme Enforced
        <div className="min-h-screen bg-[#0f0f11] text-slate-300 font-sans selection:bg-indigo-500/30 overflow-hidden relative flex flex-col">

            {/* Background Ambient Glows */}
            <div className="fixed top-[-200px] left-[-200px] w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
            <div className="fixed bottom-[-200px] right-[-200px] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none opacity-40" />

            {/* Main Content Wrapper */}
            <div className="relative z-10 w-full max-w-5xl mx-auto p-6 md:p-10 flex flex-col h-screen max-h-screen">

                {/* Header */}
                <header className="flex justify-between items-center mb-10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg shadow-indigo-500/20">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-light tracking-tight text-white/90">
                            Watermarker <span className="font-semibold text-indigo-400">Pro</span>
                        </h1>
                    </div>
                </header>

                {/* Main Action Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">

                    {/* Left Column: Upload Area */}
                    <div className="lg:col-span-8 flex flex-col gap-6 h-full min-h-0">

                        {/* Drop Zone */}
                        <div
                            className={`flex-1 relative group rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden
                                ${isDragging
                                    ? 'border-indigo-400 bg-indigo-500/10 scale-[0.99]'
                                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
                                }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input type="file" multiple accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />

                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
                                <div className={`p-6 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl mb-6 transition-transform duration-300 ${isDragging ? 'scale-110' : 'group-hover:scale-105'}`}>
                                    <Upload className="w-10 h-10 text-indigo-400" />
                                </div>
                                <h3 className="text-xl font-medium text-slate-200 mb-2">Drop your PDF files here</h3>
                                <p className="text-sm text-slate-500 max-w-xs">Support for bulk upload. Files will be processed automatically.</p>
                            </div>
                        </div>

                        {/* Configuration Bar (Floating Glass) */}
                        <div className="h-20 flex-shrink-0 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl flex items-center px-6 gap-6 shadow-2xl">

                            {/* Combobox / Dropdown */}
                            <div className="relative flex-grow">
                                <Settings className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                </div>
                                <select
                                    className="w-full bg-black/20 text-slate-200 text-sm border border-white/5 rounded-xl py-2.5 pl-10 pr-10 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-black/30 transition-all cursor-pointer"
                                    value={selectedConfig}
                                    onChange={(e) => setSelectedConfig(e.target.value)}
                                >
                                    <option value="default">Default Configuration</option>
                                    <option value="conf1">Confidential Stamp</option>
                                    <option value="draft">Draft Watermark</option>
                                </select>
                            </div>

                            <div className="h-8 w-px bg-white/10" />

                            {/* Action Toolbar */}
                            <div className="flex items-center gap-2">
                                <ToolbarBtn icon={<Plus size={18} />} tooltip="New Config" />
                                <ToolbarBtn icon={<Save size={18} />} tooltip="Save Config" />
                                <ToolbarBtn icon={<Edit3 size={18} />} tooltip="Edit Config" />
                            </div>
                        </div>
                    </div>

                    {/* Right Column: List & Execute */}
                    <div className="lg:col-span-4 flex flex-col gap-6 h-full min-h-0">

                        {/* File List Panel */}
                        <div className="flex-1 backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-3xl p-5 flex flex-col min-h-0">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">
                                Queue ({files.length})
                            </h4>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
                                {files.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                                        <FileIcon className="w-8 h-8 mb-2" />
                                        <span className="text-sm">No files yet</span>
                                    </div>
                                ) : (
                                    files.map((file, idx) => (
                                        <div key={idx} className="group flex items-center gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/5 rounded-xl transition-all">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                                                <FileIcon size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-300 truncate font-medium">{file.name}</p>
                                                {/* <p className="text-xs text-slate-600">{(file.size / 1024).toFixed(0)} KB</p> */}
                                            </div>
                                            <button
                                                onClick={() => removeFile(idx)}
                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Execute Section */}
                        <div className="flex-shrink-0 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 ml-2 font-medium">WATERMARK TEXT</label>
                                <input
                                    type="text"
                                    placeholder="Enter text..."
                                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    value={watermarkText}
                                    onChange={(e) => setWatermarkText(e.target.value)}
                                />
                            </div>

                            <button
                                className="w-full group relative py-4 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                                disabled={files.length === 0 || !watermarkText}
                                onClick={() => console.log("Processing...")}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                <span className="relative flex items-center justify-center gap-2">
                                    Start Processing <CheckCircle2 size={18} />
                                </span>
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode, tooltip: string }> = ({ icon, tooltip }) => (
    <button
        title={tooltip}
        className="p-2.5 rounded-xl bg-white/0 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
    >
        {icon}
    </button>
);

export default WatermarkPage;