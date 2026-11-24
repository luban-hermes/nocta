"use client";
import {
  Activity, AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, Book, BookOpen, Bookmark, Bot, Box, Briefcase, Calendar, Camera, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, Clock, Cloud, Code, Coffee, Compass, Copy, Cpu, Database, Download, ExternalLink, Eye, EyeOff, FileText, Film, Flag, Folder, FolderInput, Gamepad2,
  Gift, GitBranch, Globe, GraduationCap, GripVertical, HardDrive, Hash, Heart, House, Image as ImageI, Inbox, Info, KeyRound, Layers, LayoutGrid, Lightbulb, Link, LogOut, Mail, Map as MapI, MessageSquareQuote,
  Monitor, Moon, Music, Network, Newspaper, Palette, PenTool, Pencil, Pin, PinOff, Play, Plus, RefreshCw, RotateCcw, Rss, Search, Send, Server, Settings, ShieldCheck, ShoppingBag,
  Sparkles, Star, Sun, Terminal, Trash2, Upload, Users, Video, Wrench, X, Zap, type LucideIcon, type LucideProps,
} from "lucide-react";

/* UI icons come from lucide-react (no text glyphs). Names kept from the old hand-drawn set. */
type P = LucideProps & { size?: number };
const mk = (I: LucideIcon, d: number, sw = 2) => {
  const C = ({ size = d, strokeWidth = sw, ...p }: P) => <I size={size} strokeWidth={strokeWidth} aria-hidden="true" {...p} />;
  return C;
};
export const SearchIcon = mk(Search, 18);
export const MoonIcon = mk(Moon, 18);
export const SunIcon = mk(Sun, 18);
export const CloseIcon = mk(X, 16, 2.2);
export const SparkIcon = mk(Sparkles, 18);
export const ArrowUpIcon = mk(ArrowUp, 18, 2.2);
export const ArrowDownIcon = mk(ArrowDown, 12, 2.2);
export const SendIcon = mk(Send, 18);
export const PinIcon = mk(Pin, 12, 2.2);
export const PinOffIcon = mk(PinOff, 16);
export const TrashIcon = mk(Trash2, 15);
export const CopyIcon = mk(Copy, 15);
export const PlayIcon = ({ size = 22 }: { size?: number }) => <Play size={size} fill="#fff" stroke="none" aria-hidden="true" />;
export const ChevronDownIcon = mk(ChevronDown, 16);
export const ChevronRightIcon = mk(ChevronRight, 15);
export const ChevronLeftIcon = mk(ChevronLeft, 15);
export const CheckIcon = mk(Check, 15, 2.4);
export const ExternalIcon = mk(ExternalLink, 15);
export const OpenIcon = mk(Globe, 15);
export const EditIcon = mk(Pencil, 15);
export const MoveIcon = mk(FolderInput, 15);
export const RefreshIcon = mk(RefreshCw, 15);
export const LinkIcon = mk(Link, 15);
export const GripIcon = mk(GripVertical, 16);
export const PlusIcon = mk(Plus, 16, 2.4);
export const BackIcon = mk(ArrowLeft, 15);
export const ArrowLeftIcon = BackIcon;
export const OkIcon = mk(CircleCheck, 16);
export const ErrIcon = mk(CircleAlert, 16);
export const InfoIcon = mk(Info, 16);
export const WarnIcon = mk(AlertTriangle, 13);
export const UploadIcon = mk(Upload, 15);
export const SettingsIcon = mk(Settings, 16);
export const LogoutIcon = mk(LogOut, 15);
export const KeyIcon = mk(KeyRound, 15);
export const ShieldIcon = mk(ShieldCheck, 15);
export const CloudIcon = mk(Cloud, 15);
export const DownloadIcon = mk(Download, 15);
export const RestoreIcon = mk(RotateCcw, 15);
export const EyeIcon = mk(Eye, 15);
export const EyeOffIcon = mk(EyeOff, 15);
export const ArchiveIcon = mk(Archive, 15);

/* ---------- category icons: stored as lucide names; legacy text glyphs are mapped ---------- */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  star: Star, code: Code, palette: Palette, sparkles: Sparkles, play: Play, film: Film, music: Music, video: Video, "file-text": FileText, newspaper: Newspaper, book: Book,
  "book-open": BookOpen, bookmark: Bookmark, "git-branch": GitBranch, terminal: Terminal, database: Database, server: Server, cloud: Cloud, cpu: Cpu, bot: Bot, wrench: Wrench,
  "message-square-quote": MessageSquareQuote, clock: Clock, calendar: Calendar, globe: Globe, compass: Compass, map: MapI, house: House, briefcase: Briefcase, "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag, "gamepad-2": Gamepad2, image: ImageI, camera: Camera, "pen-tool": PenTool, heart: Heart, coffee: Coffee, gift: Gift, flag: Flag, lightbulb: Lightbulb,
  zap: Zap, users: Users, mail: Mail, rss: Rss, box: Box, folder: Folder, hash: Hash, "hard-drive": HardDrive, network: Network, activity: Activity, monitor: Monitor,
  layers: Layers, inbox: Inbox, "layout-grid": LayoutGrid, "arrow-left-right": ArrowLeftRight, "triangle-alert": AlertTriangle,
};
export const CATEGORY_ICON_LABELS: Record<string, string> = {
  star: "星标", code: "代码", palette: "设计", sparkles: "AI", play: "播放", film: "电影", music: "音乐", video: "视频", "file-text": "文章", newspaper: "新闻", book: "书",
  "book-open": "阅读", bookmark: "书签", "git-branch": "仓库", terminal: "终端", database: "数据库", server: "服务器", cloud: "云", cpu: "硬件", bot: "机器人", wrench: "工具",
  "message-square-quote": "帖子", clock: "稍后", calendar: "日历", globe: "网站", compass: "发现", map: "地图", house: "生活", briefcase: "工作", "graduation-cap": "学习",
  "shopping-bag": "购物", "gamepad-2": "游戏", image: "图片", camera: "摄影", "pen-tool": "创作", heart: "收藏", coffee: "休闲", gift: "礼物", flag: "旗标", lightbulb: "灵感",
  zap: "效率", users: "社区", mail: "邮件", rss: "订阅", box: "资源", folder: "文件夹", hash: "话题", "hard-drive": "存储", network: "网络", activity: "监控", monitor: "显示器",
  layers: "全部", inbox: "收件箱", "layout-grid": "导航",
};

export const LEGACY_GLYPHS: Record<string, string> = {
  "★": "star", "⌘": "code", "◐": "palette", "✦": "sparkles", "▶": "play", "¶": "file-text", "⌥": "git-branch", "❝": "message-square-quote", "◷": "clock",
  "◎": "layers", "∅": "inbox", "▤": "server", "⇄": "arrow-left-right", "⚠": "triangle-alert", "•": "folder",
};
export const resolveCatIcon = (name: string | undefined | null) => {
  const k = (name ?? "").trim();
  return CATEGORY_ICONS[k] ?? CATEGORY_ICONS[LEGACY_GLYPHS[k] ?? ""] ?? Folder;
};
export function CatIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const I = resolveCatIcon(name);
  return <I size={size} strokeWidth={1.9} aria-hidden="true" />;
}
