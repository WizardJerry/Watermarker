import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
    Sparkles,
    Trash2,
    Copy,
    FolderOpen,
    // AlignLeft, AlignCenter, AlignRight,
    // AlignJustify, ArrowUp, ArrowDown
} from 'lucide-react';

// -----------------------
// Interfaces
// -----------------------
interface WatermarkConfig {
    name: string;
    text: string;
    font_size: number;
    font_family: string;
    color: string;
    opacity: number;
    position: string;
    rotation: number;
    is_repeated: boolean;
    spacing: string;
    export_path: string;
    export_suffix: string;
}

interface UploadedFile {
    name: string;
    path: string;
    size: number;
}

const DEFAULT_CONFIG: WatermarkConfig = {
    name: "New Config",
    text: "{}",
    font_size: 48,
    font_family: "Helvetica",
    color: "#808080",
    opacity: 0.5,
    position: "Center",
    rotation: 45,
    is_repeated: false,
    spacing: "Normal",
    export_path: "",
    export_suffix: "_marked"
};

const WatermarkPage: React.FC = () => {
    // -----------------------
    // State & Logic
    // -----------------------
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [watermarkText, setWatermarkText] = useState<string>("");
    const [isDragging, setIsDragging] = useState<boolean>(false);

    // Config State
    const [configs, setConfigs] = useState<WatermarkConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<string>("");
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState<boolean>(false);
    const [editingConfig, setEditingConfig] = useState<WatermarkConfig | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        loadConfigs();
    }, []);

    const loadConfigs = async () => {
        try {
            const loaded = await invoke<WatermarkConfig[]>('get_all_configs');
            setConfigs(loaded);

            // Try to load default from localStorage, fallback to first
            const savedDefault = localStorage.getItem("defaultConfig");
            if (savedDefault && loaded.some(c => c.name === savedDefault)) {
                setSelectedConfigId(savedDefault);
            } else if (loaded.length > 0 && !selectedConfigId) {
                setSelectedConfigId(loaded[0].name);
            }
        } catch (err) {
            console.error("Failed to load configs", err);
        }
    };

    // -----------------------
    // Config Handlers
    // -----------------------
    const handleModifyConfig = () => {
        const current = configs.find(c => c.name === selectedConfigId);
        if (current) {
            setEditingConfig({ ...current });
            setIsConfigPanelOpen(true);
        }
    };

    const handleAddConfig = () => {
        setEditingConfig({ ...DEFAULT_CONFIG, name: `Config ${configs.length + 1}` });
        setIsConfigPanelOpen(true);
    };

    const handleImportConfig = async () => {
        try {
            const selectedPath = await open({
                multiple: false,
                filters: [{
                    name: 'JSON Config',
                    extensions: ['json']
                }]
            });

            if (selectedPath && typeof selectedPath === 'string') {
                const config = await invoke<WatermarkConfig>('read_external_config', { path: selectedPath });
                // Ensure name is unique or just add it
                // We'll let the user rename if needed, but for now just add/update list
                // If name exists, maybe append (Imported)
                if (configs.some(c => c.name === config.name)) {
                    config.name = `${config.name} (Imported)`;
                }

                // Save it immediately so it persists? Or just add to state? 
                // Requirement said "load config", usually implies adding to the list.
                // Let's save it to our local storage.
                await invoke('save_config', { config });
                await loadConfigs();
                setSelectedConfigId(config.name);
            }
        } catch (err) {
            console.error("Import failed", err);
        }
    };

    const handleSetDefault = () => {
        if (!editingConfig) return;
        localStorage.setItem("defaultConfig", editingConfig.name);
        // alert(`Configuration "${editingConfig.name}" set as default.`);
    };

    const handleSaveConfig = async (asNew: boolean = false) => {
        if (!editingConfig) return;

        try {
            const configToSave = { ...editingConfig };
            if (asNew) {
                configToSave.name = `${configToSave.name}_Copy`;
            }

            await invoke('save_config', { config: configToSave });
            await loadConfigs();
            setSelectedConfigId(configToSave.name);
            setIsConfigPanelOpen(false);
            setEditingConfig(null);
        } catch (err) {
            console.error("Save failed", err);
        }
    };

    const handleDeleteConfig = async () => {
        if (!editingConfig) return;
        try {
            await invoke('delete_config', { name: editingConfig.name });
            await loadConfigs();
            // Select first available or nothing
            const remaining = configs.filter(c => c.name !== editingConfig.name);
            if (remaining.length > 0) setSelectedConfigId(remaining[0].name);
            else setSelectedConfigId("");

            setIsConfigPanelOpen(false);
            setEditingConfig(null);
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    // -----------------------
    // Drag & Drop (Existing)
    // -----------------------
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

    // Tauri Listeners (Existing)
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

    // -----------------------
    // Execution
    // -----------------------
    const handleProcess = async () => {
        if (files.length === 0 || !selectedConfigId) return;

        const currentConfig = configs.find(c => c.name === selectedConfigId);
        if (!currentConfig) return;

        // Loop through files and process
        // For prototype, just doing one or log
        // Ideally: invoke 'add_watermark' for each
        for (const file of files) {
            try {
                await invoke('add_watermark', {
                    inputPath: file.path,
                    userText: watermarkText,
                    config: currentConfig
                });
                console.log(`Processed ${file.name}`);
            } catch (e) {
                console.error(`Failed ${file.name}`, e);
            }
        }
        alert("Processing Complete!");
    };


    return (
        // Global Container: Dark Theme Enforced
        <div className="min-h-screen bg-[#0f0f11] text-slate-300 font-sans selection:bg-indigo-500/30 overflow-hidden relative flex flex-col">

            {/* Background Ambient Glows */}
            <div className="fixed top-[-200px] left-[-200px] w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
            <div className="fixed bottom-[-200px] right-[-200px] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none opacity-40" />

            {/* Main Content Wrapper */}
            <div className="relative z-10 w-full max-w-6xl mx-auto p-6 md:p-8 flex flex-col h-screen max-h-screen">

                {/* Header */}
                <header className="flex justify-between items-center mb-6 flex-shrink-0">
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
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">

                    {/* Left Column: Upload Area */}
                    <div className="lg:col-span-8 flex flex-col gap-5 h-full min-h-0">

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

                        {/* Configuration Bar (Updated) */}
                        <div className="h-20 flex-shrink-0 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl flex items-center px-6 gap-4 shadow-2xl">

                            {/* Combobox / Dropdown */}
                            <div className="relative flex-grow">
                                <Settings className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                </div>
                                <select
                                    className="w-full bg-black/20 text-slate-200 text-sm border border-white/5 rounded-xl py-2.5 pl-10 pr-10 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-black/30 transition-all cursor-pointer"
                                    value={selectedConfigId}
                                    onChange={(e) => setSelectedConfigId(e.target.value)}
                                >
                                    {configs.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="h-8 w-px bg-white/10" />

                            {/* Action Toolbar: Modify | Add | Import */}
                            <div className="flex items-center gap-2">
                                <ToolbarBtn
                                    icon={<Edit3 size={16} />}
                                    text="Modify"
                                    onClick={handleModifyConfig}
                                />
                                <ToolbarBtn
                                    icon={<Plus size={16} />}
                                    text="Add"
                                    onClick={handleAddConfig}
                                />
                                <ToolbarBtn
                                    icon={<FolderOpen size={16} />}
                                    text="Import"
                                    onClick={handleImportConfig}
                                />
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
                                <label className="text-xs text-slate-500 ml-2 font-medium">CONTENT TO INSERT {'{}'}</label>
                                <input
                                    type="text"
                                    placeholder="e.g. v1.0, 2024, UserID"
                                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    value={watermarkText}
                                    onChange={(e) => setWatermarkText(e.target.value)}
                                />
                            </div>

                            <button
                                className="w-full group relative py-4 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                                disabled={files.length === 0 || !selectedConfigId}
                                onClick={handleProcess}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                <span className="relative flex items-center justify-center gap-2">
                                    Start Processing <CheckCircle2 size={18} />
                                </span>
                            </button>
                        </div>

                    </div>
                </div>

                {/* Configuration Panel Modal/Overlay */}
                {isConfigPanelOpen && editingConfig && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
                        <div className="w-full max-w-2xl bg-[#131316] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden">

                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                        <Settings size={20} />
                                    </div>
                                    <h2 className="text-lg font-medium text-white">Configuration Editor</h2>
                                </div>
                                <button
                                    onClick={() => setIsConfigPanelOpen(false)}
                                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Body (Scrollable) */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">

                                {/* Name & Template */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">CONFIG NAME</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                                            value={editingConfig.name}
                                            onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">TEXT TEMPLATE (Use {'{}'} for input)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                                            value={editingConfig.text}
                                            onChange={(e) => setEditingConfig({ ...editingConfig, text: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Export Configuration Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Export Path */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">EXPORT LOCATION</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-300 truncate">
                                                {editingConfig.export_path === "" ? (
                                                    <span className="text-slate-500 italic">Same as source folder</span>
                                                ) : (
                                                    editingConfig.export_path
                                                )}
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const selected = await open({
                                                        directory: true,
                                                        multiple: false,
                                                    });
                                                    if (selected && typeof selected === 'string') {
                                                        setEditingConfig({ ...editingConfig, export_path: selected });
                                                    }
                                                }}
                                                className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition-colors"
                                                title="Select Custom Folder"
                                            >
                                                <FolderOpen size={16} />
                                            </button>
                                            {editingConfig.export_path !== "" && (
                                                <button
                                                    onClick={() => setEditingConfig({ ...editingConfig, export_path: "" })}
                                                    className="px-3 bg-white/5 hover:bg-red-500/20 border border-white/10 rounded-xl text-slate-300 hover:text-red-400 transition-colors"
                                                    title="Reset to Source Folder"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Export Suffix */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">FILE SUFFIX (Use {'{}'} for placeholder)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                                            value={editingConfig.export_suffix}
                                            onChange={(e) => setEditingConfig({ ...editingConfig, export_suffix: e.target.value })}
                                            placeholder="_marked"
                                        />
                                    </div>
                                </div>

                                {/* Appearance Row */}
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">FONT FAMILY</label>
                                        <select
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-indigo-500/50 focus:outline-none appearance-none"
                                            value={editingConfig.font_family}
                                            onChange={(e) => setEditingConfig({ ...editingConfig, font_family: e.target.value })}
                                        >
                                            <option value="Helvetica">Helvetica</option>
                                            <option value="Times-Roman">Times Roman</option>
                                            <option value="Courier">Courier</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">SIZE</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                                            value={editingConfig.font_size}
                                            onChange={(e) => setEditingConfig({ ...editingConfig, font_size: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium ml-1">COLOR</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                className="h-10 w-full bg-transparent border-none cursor-pointer"
                                                value={editingConfig.color}
                                                onChange={(e) => setEditingConfig({ ...editingConfig, color: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 my-2" />

                                {/* Layout & Position Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                                    {/* Left: Position Matrix */}
                                    <div className="space-y-3">
                                        <label className="text-xs text-slate-500 font-medium ml-1">POSITION (ANCHOR)</label>
                                        <div className="aspect-square w-48 bg-white/5 rounded-2xl border border-white/10 p-2 grid grid-cols-3 gap-2 mx-auto md:mx-0">
                                            {['TopLeft', 'TopCenter', 'TopRight', 'CenterLeft', 'Center', 'CenterRight', 'BottomLeft', 'BottomCenter', 'BottomRight'].map(pos => (
                                                <button
                                                    key={pos}
                                                    onClick={() => setEditingConfig({ ...editingConfig, position: pos })}
                                                    className={`rounded-lg transition-all border ${editingConfig.position === pos
                                                        ? 'bg-indigo-500 border-indigo-400 text-white'
                                                        : 'bg-white/5 border-transparent hover:bg-white/10 text-slate-500'
                                                        }`}
                                                >
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className={`w-2 h-2 rounded-full ${editingConfig.position === pos ? 'bg-white' : 'bg-slate-600'}`} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: Tiling & Rotation */}
                                    <div className="space-y-6">

                                        {/* Rotation */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-slate-500 font-medium">ROTATION ({editingConfig.rotation}°)</label>
                                            </div>
                                            <input
                                                type="range" min="0" max="360" step="15"
                                                className="w-full accent-indigo-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                                value={editingConfig.rotation}
                                                onChange={(e) => setEditingConfig({ ...editingConfig, rotation: parseFloat(e.target.value) })}
                                            />
                                        </div>

                                        {/* Opacity */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-slate-500 font-medium">OPACITY ({Math.round(editingConfig.opacity * 100)}%)</label>
                                            </div>
                                            <input
                                                type="range" min="0.1" max="1" step="0.1"
                                                className="w-full accent-indigo-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                                value={editingConfig.opacity}
                                                onChange={(e) => setEditingConfig({ ...editingConfig, opacity: parseFloat(e.target.value) })}
                                            />
                                        </div>

                                        {/* Tiling Options */}
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-300">Repeat Watermark</span>
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
                                                    checked={editingConfig.is_repeated}
                                                    onChange={(e) => setEditingConfig({ ...editingConfig, is_repeated: e.target.checked })}
                                                />
                                            </div>

                                            {editingConfig.is_repeated && (
                                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label className="text-xs text-slate-500 font-medium">SPACING DENSITY</label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {['Loose', 'Normal', 'Tight'].map(s => (
                                                            <button
                                                                key={s}
                                                                onClick={() => setEditingConfig({ ...editingConfig, spacing: s })}
                                                                className={`px-3 py-1.5 text-xs rounded-lg border ${editingConfig.spacing === s
                                                                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                                                    : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                                                                    }`}
                                                            >
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            </div>

                            {/* Footer / Actions */}
                            <div className="p-6 border-t border-white/5 flex items-center justify-between bg-[#0f0f11]/50">
                                <button
                                    onClick={handleDeleteConfig}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
                                >
                                    <Trash2 size={16} /> Delete
                                </button>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleSetDefault}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium border border-transparent hover:border-indigo-500/30"
                                        title="Set as default on startup"
                                    >
                                        <CheckCircle2 size={16} className="text-indigo-400" /> Set Default
                                    </button>
                                    <button
                                        onClick={() => handleSaveConfig(true)}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
                                    >
                                        <Copy size={16} /> Save As New
                                    </button>
                                    <button
                                        onClick={() => handleSaveConfig(false)}
                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all text-sm font-semibold"
                                    >
                                        <Save size={16} /> Save Changes
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

// Updated Toolbar Button Component
const ToolbarBtn: React.FC<{ icon: React.ReactNode, text: string, onClick?: () => void }> = ({ icon, text, onClick }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 hover:border-white/10 transition-all active:scale-95"
    >
        {icon}
        <span className="text-xs font-medium">{text}</span>
    </button>
);

export default WatermarkPage;