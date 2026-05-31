import React, { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    CheckCircle2,
    ChevronDown,
    Copy,
    Edit3,
    File as FileIcon,
    FileText,
    FolderOpen,
    Layers3,
    Play,
    Plus,
    Pin,
    Save,
    Settings,
    SlidersHorizontal,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

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

interface ProcessStatus {
    type: 'success' | 'error' | 'info';
    message: string;
}

const DEFAULT_CONFIG: WatermarkConfig = {
    name: 'New Config',
    text: '{}',
    font_size: 48,
    font_family: 'Helvetica',
    color: '#808080',
    opacity: 0.5,
    position: 'Center',
    rotation: 45,
    is_repeated: false,
    spacing: 'Normal',
    export_path: '',
    export_suffix: '_marked',
};

const positionOptions = [
    'TopLeft',
    'TopCenter',
    'TopRight',
    'CenterLeft',
    'Center',
    'CenterRight',
    'BottomLeft',
    'BottomCenter',
    'BottomRight',
];

const getFileName = (path: string) => path.split(/[/\\]/).pop() || path;

const WatermarkPage: React.FC = () => {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [watermarkText, setWatermarkText] = useState<string>('');
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false);
    const [processStatus, setProcessStatus] = useState<ProcessStatus | null>(null);
    const [configs, setConfigs] = useState<WatermarkConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<string>('');
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState<boolean>(false);
    const [editingConfig, setEditingConfig] = useState<WatermarkConfig | null>(null);

    const selectedConfig = useMemo(
        () => configs.find((config) => config.name === selectedConfigId),
        [configs, selectedConfigId],
    );

    const addFilesByPath = (paths: string[]) => {
        const selectedFiles = paths
            .filter((path) => path.toLowerCase().endsWith('.pdf'))
            .map((path) => ({
                name: getFileName(path),
                path,
                size: 0,
            }));

        if (selectedFiles.length > 0) {
            setFiles((prev) => {
                const existingPaths = new Set(prev.map((file) => file.path));
                const uniqueFiles = selectedFiles.filter((file) => !existingPaths.has(file.path));
                return [...prev, ...uniqueFiles];
            });
            setProcessStatus(null);
        }
    };

    useEffect(() => {
        loadConfigs();
        loadAlwaysOnTopState();
    }, []);

    const loadAlwaysOnTopState = async () => {
        try {
            const enabled = await getCurrentWindow().isAlwaysOnTop();
            setIsAlwaysOnTop(enabled);
        } catch (error) {
            console.error('Failed to load always-on-top state', error);
        }
    };

    const loadConfigs = async () => {
        try {
            const loaded = await invoke<WatermarkConfig[]>('get_all_configs');
            setConfigs(loaded);

            const savedDefault = localStorage.getItem('defaultConfig');
            if (savedDefault && loaded.some((config) => config.name === savedDefault)) {
                setSelectedConfigId(savedDefault);
            } else if (loaded.length > 0 && !selectedConfigId) {
                setSelectedConfigId(loaded[0].name);
            }
        } catch (err) {
            console.error('Failed to load configs', err);
        }
    };

    const handleModifyConfig = () => {
        if (selectedConfig) {
            setEditingConfig({ ...selectedConfig });
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
                    extensions: ['json'],
                }],
            });

            if (selectedPath && typeof selectedPath === 'string') {
                const config = await invoke<WatermarkConfig>('read_external_config', { path: selectedPath });
                if (configs.some((item) => item.name === config.name)) {
                    config.name = `${config.name} (Imported)`;
                }

                await invoke('save_config', { config });
                await loadConfigs();
                setSelectedConfigId(config.name);
            }
        } catch (err) {
            console.error('Import failed', err);
        }
    };

    const handleSetDefault = () => {
        if (!editingConfig) return;
        localStorage.setItem('defaultConfig', editingConfig.name);
    };

    const handleToggleAlwaysOnTop = async () => {
        const nextValue = !isAlwaysOnTop;
        setIsAlwaysOnTop(nextValue);

        try {
            await getCurrentWindow().setAlwaysOnTop(nextValue);
        } catch (error) {
            setIsAlwaysOnTop(!nextValue);
            console.error('Failed to toggle always on top', error);
            setProcessStatus({
                type: 'error',
                message: `Always on top toggle failed: ${String(error)}`,
            });
        }
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
            console.error('Save failed', err);
        }
    };

    const handleDeleteConfig = async () => {
        if (!editingConfig) return;

        try {
            await invoke('delete_config', { name: editingConfig.name });
            await loadConfigs();

            const remaining = configs.filter((config) => config.name !== editingConfig.name);
            setSelectedConfigId(remaining[0]?.name ?? '');
            setIsConfigPanelOpen(false);
            setEditingConfig(null);
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);

        if (event.dataTransfer.files) {
            const paths = Array.from(event.dataTransfer.files)
                .map((file) => (file as any).path)
                .filter((path): path is string => typeof path === 'string' && path.length > 0);

            if (paths.length > 0) {
                addFilesByPath(paths);
            }
        }
    };

    const handleBrowseFiles = async () => {
        try {
            const selectedPaths = await open({
                multiple: true,
                filters: [{
                    name: 'PDF Files',
                    extensions: ['pdf'],
                }],
            });

            if (!selectedPaths) return;

            const paths = Array.isArray(selectedPaths) ? selectedPaths : [selectedPaths];
            addFilesByPath(paths);
        } catch (error) {
            console.error('Failed to select PDF files', error);
            setProcessStatus({
                type: 'error',
                message: `File selection failed: ${String(error)}`,
            });
        }
    };

    useEffect(() => {
        const unlistenDrop = listen<{ paths: string[], position: { x: number, y: number } }>('tauri://drag-drop', (event) => {
            const payload = event.payload;
            const paths = payload.paths || (Array.isArray(payload) ? payload : []);

            if (paths && paths.length > 0) {
                addFilesByPath(paths);
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
            unlistenDrop.then((dispose) => dispose());
            unlistenEnter.then((dispose) => dispose());
            unlistenLeave.then((dispose) => dispose());
        };
    }, []);

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        setProcessStatus(null);
    };

    const handleProcess = async () => {
        if (files.length === 0 || !selectedConfig || isProcessing) return;

        setIsProcessing(true);
        setProcessStatus({
            type: 'info',
            message: `Processing ${files.length} file${files.length > 1 ? 's' : ''}...`,
        });

        const successes: string[] = [];
        const failures: string[] = [];

        for (const file of files) {
            try {
                const outputPath = await invoke<string>('add_watermark', {
                    inputPath: file.path,
                    userText: watermarkText,
                    config: selectedConfig,
                });
                successes.push(outputPath);
                console.log(`Processed ${file.name}`);
            } catch (error) {
                failures.push(`${file.name}: ${String(error)}`);
                console.error(`Failed ${file.name}`, error);
            }
        }

        setIsProcessing(false);

        if (failures.length > 0) {
            const message = `Processed ${successes.length}/${files.length} files. Failed: ${failures.join('; ')}`;
            setProcessStatus({ type: 'error', message });
            alert(message);
            return;
        }

        const message = `Processing complete. Generated ${successes.length} file${successes.length > 1 ? 's' : ''}.`;
        setProcessStatus({ type: 'success', message });
        alert(`${message}\n${successes.join('\n')}`);
    };

    return (
        <div className="min-h-screen bg-[#1f2023] text-slate-100 font-sans selection:bg-[#fbbc04]/30">
            <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 md:h-screen md:max-h-screen md:px-8">
                <header className="mb-5 flex flex-shrink-0 items-center justify-between border-b border-[#3b3d42] pb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fbbc04] text-[#202124] shadow-sm">
                            <Layers3 size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold tracking-normal text-slate-50">Watermarker Pro</h1>
                            <p className="text-sm text-slate-400">PDF watermark workspace</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isAlwaysOnTop}
                        onClick={handleToggleAlwaysOnTop}
                        className={`flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/20 sm:gap-3 ${
                            isAlwaysOnTop
                                ? 'border-[#fbbc04]/50 bg-[#fbbc04]/15 text-[#fdd663]'
                                : 'border-[#4a4d53] bg-[#303238] text-slate-300 hover:border-[#656871] hover:bg-[#36393f]'
                        }`}
                        title="Toggle always on top"
                    >
                        <Pin size={16} />
                        <span className="hidden sm:inline">Always on top</span>
                        <span className="sm:hidden">Top</span>
                        <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                            isAlwaysOnTop ? 'bg-[#fbbc04]' : 'bg-[#5f6368]'
                        }`}>
                            <span className={`h-4 w-4 rounded-full transition-transform ${
                                isAlwaysOnTop ? 'translate-x-4 bg-[#202124]' : 'translate-x-0 bg-slate-300'
                            }`} />
                        </span>
                    </button>
                </header>

                <main className="grid flex-1 grid-cols-1 gap-5 overflow-visible md:min-h-0 md:grid-cols-12 md:overflow-hidden">
                    <section className="flex min-h-0 flex-col gap-4 md:col-span-8">
                        <button
                            type="button"
                            className={`group flex min-h-52 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-8 py-10 text-center transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/25 md:min-h-0 md:py-8 ${
                                isDragging
                                    ? 'border-[#fbbc04] bg-[#3b3421] shadow-md shadow-black/20'
                                    : 'border-[#4a4d53] bg-[#292b30] shadow-sm shadow-black/20 hover:border-[#fbbc04]/70 hover:bg-[#303238] hover:shadow-md'
                            }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={handleBrowseFiles}
                        >
                            <span className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
                                isDragging ? 'bg-[#fbbc04] text-[#202124]' : 'bg-[#3b3421] text-[#fbbc04] group-hover:bg-[#4a3d1c]'
                            }`}>
                                <Upload size={30} />
                            </span>
                            <span className="text-2xl font-semibold tracking-normal text-slate-50">Drop PDF files here</span>
                            <span className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                                Click to browse or drag files into this workspace.
                            </span>
                        </button>

                        <div className="rounded-lg border border-[#3b3d42] bg-[#292b30] p-4 shadow-sm shadow-black/20">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                                <SelectField
                                    className="flex-1"
                                    icon={<Settings size={18} />}
                                    label="Watermark config"
                                    value={selectedConfigId}
                                    onChange={(event) => setSelectedConfigId(event.target.value)}
                                >
                                    {configs.length === 0 ? (
                                        <option value="">No config loaded</option>
                                    ) : (
                                        configs.map((config) => (
                                            <option key={config.name} value={config.name}>{config.name}</option>
                                        ))
                                    )}
                                </SelectField>

                                <div className="grid grid-cols-3 gap-2 xl:flex xl:justify-end">
                                    <ActionButton icon={<Edit3 size={18} />} onClick={handleModifyConfig} disabled={!selectedConfig}>
                                        Modify
                                    </ActionButton>
                                    <ActionButton icon={<Plus size={18} />} onClick={handleAddConfig}>
                                        Add
                                    </ActionButton>
                                    <ActionButton icon={<FolderOpen size={18} />} onClick={handleImportConfig}>
                                        Import
                                    </ActionButton>
                                </div>
                            </div>
                        </div>
                    </section>

                    <aside className="flex min-h-[420px] flex-col gap-4 md:col-span-4 md:min-h-0">
                        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-[#3b3d42] bg-[#292b30] shadow-sm shadow-black/20">
                            <div className="flex items-center justify-between border-b border-[#3b3d42] px-4 py-3">
                                <SectionTitle icon={<FileText size={18} />} title="Queue" />
                                <span className="rounded-full border border-[#fbbc04]/30 bg-[#fbbc04]/10 px-2.5 py-1 text-xs font-medium text-[#fdd663]">{files.length}</span>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                {files.length === 0 ? (
                                    <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-lg bg-[#232529] text-center text-slate-400">
                                        <FileIcon className="mb-3 text-slate-500" size={34} />
                                        <span className="text-sm font-medium">No files selected</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map((file, index) => (
                                            <div key={`${file.path}-${index}`} className="group flex items-center gap-3 rounded-lg border border-[#3b3d42] bg-[#303238] p-3 transition-colors hover:bg-[#36393f]">
                                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#3b3421] text-[#fbbc04]">
                                                    <FileIcon size={17} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-slate-100">{file.name}</p>
                                                    <p className="truncate text-xs text-slate-400">{file.path}</p>
                                                </div>
                                                <IconButton label="Remove file" onClick={() => removeFile(index)}>
                                                    <X size={18} />
                                                </IconButton>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="rounded-lg border border-[#3b3d42] bg-[#292b30] p-4 shadow-sm shadow-black/20">
                            <TextField
                                label="Content placeholder"
                                placeholder="e.g. v1.0, 2026, UserID"
                                value={watermarkText}
                                onChange={(event) => setWatermarkText(event.target.value)}
                            />

                            {processStatus && (
                                <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                                    processStatus.type === 'success'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                        : processStatus.type === 'error'
                                            ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                            : 'border-[#fbbc04]/30 bg-[#fbbc04]/10 text-[#fdd663]'
                                }`}>
                                    {processStatus.message}
                                </div>
                            )}

                            <button
                                type="button"
                                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#fbbc04] px-5 text-sm font-semibold text-[#202124] shadow-sm transition-all hover:bg-[#f9ab00] hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/25 disabled:cursor-not-allowed disabled:bg-[#46484d] disabled:text-slate-500 disabled:shadow-none"
                                disabled={files.length === 0 || !selectedConfigId || isProcessing}
                                onClick={handleProcess}
                            >
                                <Play size={18} fill="currentColor" />
                                {isProcessing ? 'Processing...' : 'Start processing'}
                            </button>
                        </section>
                    </aside>
                </main>
            </div>

            {isConfigPanelOpen && editingConfig && (
                <ConfigDialog
                    config={editingConfig}
                    setConfig={setEditingConfig}
                    onClose={() => setIsConfigPanelOpen(false)}
                    onDelete={handleDeleteConfig}
                    onSetDefault={handleSetDefault}
                    onSaveAsNew={() => handleSaveConfig(true)}
                    onSave={() => handleSaveConfig(false)}
                />
            )}
        </div>
    );
};

interface ConfigDialogProps {
    config: WatermarkConfig;
    setConfig: React.Dispatch<React.SetStateAction<WatermarkConfig | null>>;
    onClose: () => void;
    onDelete: () => void;
    onSetDefault: () => void;
    onSaveAsNew: () => void;
    onSave: () => void;
}

const ConfigDialog: React.FC<ConfigDialogProps> = ({
    config,
    setConfig,
    onClose,
    onDelete,
    onSetDefault,
    onSaveAsNew,
    onSave,
}) => {
    const updateConfig = (patch: Partial<WatermarkConfig>) => {
        setConfig((current) => current ? { ...current, ...patch } : current);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#45484f] bg-[#292b30] shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-[#3b3d42] px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3b3421] text-[#fbbc04]">
                            <SlidersHorizontal size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-50">Configuration editor</h2>
                            <p className="text-sm text-slate-400">Adjust output, appearance, and layout.</p>
                        </div>
                    </div>
                    <IconButton label="Close editor" onClick={onClose}>
                        <X size={20} />
                    </IconButton>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <FormSection title="Template">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <TextField
                                    label="Config name"
                                    value={config.name}
                                    onChange={(event) => updateConfig({ name: event.target.value })}
                                />
                                <TextField
                                    label="Text template"
                                    value={config.text}
                                    onChange={(event) => updateConfig({ text: event.target.value })}
                                />
                            </div>
                        </FormSection>

                        <FormSection title="Export">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <FieldLabel>Export location</FieldLabel>
                                    <div className="flex gap-2">
                                        <div className="flex h-12 min-w-0 flex-1 items-center rounded-lg border border-[#4a4d53] bg-[#232529] px-3 text-sm text-slate-300">
                                            <span className="truncate">
                                                {config.export_path === '' ? 'Same as source folder' : config.export_path}
                                            </span>
                                        </div>
                                        <IconButton
                                            label="Select folder"
                                            variant="outlined"
                                            onClick={async () => {
                                                const selected = await open({
                                                    directory: true,
                                                    multiple: false,
                                                });
                                                if (selected && typeof selected === 'string') {
                                                    updateConfig({ export_path: selected });
                                                }
                                            }}
                                        >
                                            <FolderOpen size={18} />
                                        </IconButton>
                                        {config.export_path !== '' && (
                                            <IconButton label="Reset folder" variant="outlined" onClick={() => updateConfig({ export_path: '' })}>
                                                <X size={18} />
                                            </IconButton>
                                        )}
                                    </div>
                                </div>
                                <TextField
                                    label="File suffix"
                                    placeholder="_marked"
                                    value={config.export_suffix}
                                    onChange={(event) => updateConfig({ export_suffix: event.target.value })}
                                />
                            </div>
                        </FormSection>

                        <FormSection title="Appearance">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <SelectField
                                    className="md:col-span-2"
                                    label="Font family"
                                    value={config.font_family}
                                    onChange={(event) => updateConfig({ font_family: event.target.value })}
                                >
                                    <option value="Helvetica">Helvetica</option>
                                    <option value="Times-Roman">Times Roman</option>
                                    <option value="Courier">Courier</option>
                                </SelectField>
                                <TextField
                                    label="Size"
                                    type="number"
                                    value={config.font_size}
                                    onChange={(event) => updateConfig({ font_size: parseFloat(event.target.value) })}
                                />
                                <div>
                                    <FieldLabel>Color</FieldLabel>
                                    <div className="flex h-12 items-center gap-3 rounded-lg border border-[#4a4d53] bg-[#232529] px-3">
                                        <input
                                            type="color"
                                            className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                                            value={config.color}
                                            onChange={(event) => updateConfig({ color: event.target.value })}
                                        />
                                        <span className="text-sm font-medium text-slate-300">{config.color}</span>
                                    </div>
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Layout">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
                                <div>
                                    <FieldLabel>Position</FieldLabel>
                                    <div className="grid aspect-square w-full max-w-[220px] grid-cols-3 gap-2 rounded-lg border border-[#3b3d42] bg-[#232529] p-2">
                                        {positionOptions.map((position) => (
                                            <button
                                                type="button"
                                                key={position}
                                                title={position}
                                                onClick={() => updateConfig({ position })}
                                                className={`rounded-lg border text-slate-400 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/20 ${
                                                    config.position === position
                                                        ? 'border-[#fbbc04] bg-[#3b3421] text-[#fdd663] shadow-sm'
                                                        : 'border-transparent bg-[#303238] hover:border-[#4a4d53] hover:bg-[#36393f]'
                                                }`}
                                            >
                                                <span className={`mx-auto block h-2.5 w-2.5 rounded-full ${
                                                    config.position === position ? 'bg-[#fbbc04]' : 'bg-slate-500'
                                                }`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <RangeField
                                        label={`Rotation (${config.rotation} deg)`}
                                        min={0}
                                        max={360}
                                        step={15}
                                        value={config.rotation}
                                        onChange={(event) => updateConfig({ rotation: parseFloat(event.target.value) })}
                                    />
                                    <RangeField
                                        label={`Opacity (${Math.round(config.opacity * 100)}%)`}
                                        min={0.1}
                                        max={1}
                                        step={0.1}
                                        value={config.opacity}
                                        onChange={(event) => updateConfig({ opacity: parseFloat(event.target.value) })}
                                    />
                                    <div className="rounded-lg border border-[#3b3d42] bg-[#232529] p-4">
                                        <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                                            Repeat watermark
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 cursor-pointer rounded border-[#4a4d53] accent-[#fbbc04]"
                                                checked={config.is_repeated}
                                                onChange={(event) => updateConfig({ is_repeated: event.target.checked })}
                                            />
                                        </label>

                                        {config.is_repeated && (
                                            <div className="mt-4">
                                                <FieldLabel>Spacing density</FieldLabel>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {['Loose', 'Normal', 'Tight'].map((spacing) => (
                                                        <button
                                                            type="button"
                                                            key={spacing}
                                                            onClick={() => updateConfig({ spacing })}
                                                            className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/20 ${
                                                                config.spacing === spacing
                                                                    ? 'border-[#fbbc04] bg-[#3b3421] text-[#fdd663]'
                                                                    : 'border-[#4a4d53] bg-[#303238] text-slate-300 hover:bg-[#36393f]'
                                                            }`}
                                                        >
                                                            {spacing}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </FormSection>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-[#3b3d42] bg-[#232529] px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <button
                        type="button"
                        onClick={onDelete}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20"
                    >
                        <Trash2 size={18} />
                        Delete
                    </button>

                    <div className="grid grid-cols-1 gap-2 md:flex">
                        <ActionButton icon={<CheckCircle2 size={18} />} onClick={onSetDefault}>
                            Set default
                        </ActionButton>
                        <ActionButton icon={<Copy size={18} />} onClick={onSaveAsNew}>
                            Save as new
                        </ActionButton>
                        <button
                            type="button"
                            onClick={onSave}
                            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#fbbc04] px-5 text-sm font-semibold text-[#202124] shadow-sm transition-colors hover:bg-[#f9ab00] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/25"
                        >
                            <Save size={18} />
                            Save changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span className="text-[#fbbc04]">{icon}</span>
        {title}
    </div>
);

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="rounded-lg border border-[#3b3d42] bg-[#303238] p-4 shadow-sm shadow-black/20">
        <h3 className="mb-4 text-sm font-semibold text-slate-50">{title}</h3>
        {children}
    </section>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label className="mb-1.5 block text-xs font-semibold text-slate-300">{children}</label>
);

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
};

const TextField: React.FC<TextFieldProps> = ({ label, className = '', ...props }) => (
    <label className={`block ${className}`}>
        <FieldLabel>{label}</FieldLabel>
        <input
            {...props}
            className="h-12 w-full rounded-lg border border-[#4a4d53] bg-[#232529] px-3 text-sm text-slate-100 shadow-sm shadow-black/10 transition-colors placeholder:text-slate-500 hover:border-[#656871] focus:border-[#fbbc04] focus:outline-none focus:ring-4 focus:ring-[#fbbc04]/15"
        />
    </label>
);

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
};

const SelectField: React.FC<SelectFieldProps> = ({ label, icon, children, className = '', ...props }) => (
    <label className={`block ${className}`}>
        <FieldLabel>{label}</FieldLabel>
        <div className="relative">
            {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
            <select
                {...props}
                className={`h-12 w-full appearance-none rounded-lg border border-[#4a4d53] bg-[#232529] text-sm font-medium text-slate-100 shadow-sm shadow-black/10 transition-colors hover:border-[#656871] focus:border-[#fbbc04] focus:outline-none focus:ring-4 focus:ring-[#fbbc04]/15 ${icon ? 'pl-10' : 'pl-3'} pr-10`}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        </div>
    </label>
);

type RangeFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
};

const RangeField: React.FC<RangeFieldProps> = ({ label, ...props }) => (
    <label className="block">
        <FieldLabel>{label}</FieldLabel>
        <input
            {...props}
            type="range"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#46484d] accent-[#fbbc04]"
        />
    </label>
);

const ActionButton: React.FC<{
    icon: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
}> = ({ icon, children, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[#4a4d53] bg-[#303238] px-4 text-sm font-semibold text-slate-200 shadow-sm shadow-black/10 transition-colors hover:border-[#fbbc04]/60 hover:bg-[#36393f] hover:text-[#fdd663] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/15 disabled:cursor-not-allowed disabled:border-[#3b3d42] disabled:bg-[#25272b] disabled:text-slate-600"
    >
        {icon}
        <span>{children}</span>
    </button>
);

const IconButton: React.FC<{
    label: string;
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'ghost' | 'outlined';
}> = ({ label, children, onClick, variant = 'ghost' }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fbbc04]/15 ${
            variant === 'outlined'
                ? 'border border-[#4a4d53] bg-[#303238] hover:border-[#fbbc04]/60 hover:bg-[#36393f]'
                : 'hover:bg-[#36393f] hover:text-red-300'
        }`}
    >
        {children}
    </button>
);

export default WatermarkPage;
