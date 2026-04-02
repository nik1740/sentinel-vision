import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Brain,
  Upload,
  FileCode2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Layers,
  Activity,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type AnalysisStatus = "idle" | "scanning" | "complete";
type LayerStatus = "Clean" | "Suspicious" | "Infected";

interface LayerResult {
  id: string;
  name: string;
  type: string;
  params: string;
  entropy: number;
  anomalyScore: number;
  status: LayerStatus;
}

interface WeightDistPoint {
  layer: string;
  mean: number;
  stddev: number;
  kurtosis: number;
}

interface ModelMeta {
  name: string;
  size: string;
  format: string;
  layers: number;
  parameters: string;
}

// ── Mock analysis data ───────────────────────────────────────────────────────

const MOCK_LAYERS: LayerResult[] = [
  { id: "L01", name: "conv1",         type: "Conv2D",    params: "1,792",    entropy: 7.82, anomalyScore: 4,  status: "Clean"      },
  { id: "L02", name: "conv2",         type: "Conv2D",    params: "36,928",   entropy: 7.91, anomalyScore: 6,  status: "Clean"      },
  { id: "L03", name: "conv3",         type: "Conv2D",    params: "73,856",   entropy: 7.88, anomalyScore: 9,  status: "Clean"      },
  { id: "L04", name: "fc1",           type: "Dense",     params: "524,800",  entropy: 7.65, anomalyScore: 18, status: "Suspicious" },
  { id: "L05", name: "fc2",           type: "Dense",     params: "131,584",  entropy: 6.34, anomalyScore: 74, status: "Infected"   },
  { id: "L06", name: "batch_norm1",   type: "BatchNorm", params: "256",      entropy: 7.94, anomalyScore: 3,  status: "Clean"      },
  { id: "L07", name: "dropout1",      type: "Dropout",   params: "0",        entropy: 0.00, anomalyScore: 0,  status: "Clean"      },
  { id: "L08", name: "output",        type: "Dense",     params: "65,546",   entropy: 7.71, anomalyScore: 11, status: "Clean"      },
];

const MOCK_WEIGHT_DIST: WeightDistPoint[] = [
  { layer: "conv1",       mean: 0.001,  stddev: 0.043, kurtosis: 3.1 },
  { layer: "conv2",       mean: -0.002, stddev: 0.038, kurtosis: 3.3 },
  { layer: "conv3",       mean: 0.000,  stddev: 0.041, kurtosis: 3.0 },
  { layer: "fc1",         mean: 0.003,  stddev: 0.052, kurtosis: 4.7 },
  { layer: "fc2",         mean: -0.021, stddev: 0.187, kurtosis: 9.8 },
  { layer: "batch_norm1", mean: 0.001,  stddev: 0.012, kurtosis: 3.2 },
  { layer: "output",      mean: 0.000,  stddev: 0.049, kurtosis: 3.4 },
];

const MOCK_META: ModelMeta = {
  name: "model_v3.h5",
  size: "18.4 MB",
  format: "HDF5 / Keras",
  layers: 8,
  parameters: "834,762",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCEPTED_EXTS = [".h5", ".pt", ".pth", ".onnx", ".pb", ".pkl", ".bin"];

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

function StatusBadge({ status }: { status: LayerStatus }) {
  if (status === "Clean")
    return <Badge className="bg-safe/15 text-safe border-safe/30 hover:bg-safe/20">Clean</Badge>;
  if (status === "Infected")
    return <Badge className="bg-threat/15 text-threat border-threat/30 hover:bg-threat/20">Infected</Badge>;
  return <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/20">Suspicious</Badge>;
}

function AnomalyBar({ score }: { score: number }) {
  const color =
    score >= 60 ? "bg-threat" : score >= 15 ? "bg-warning" : "bg-safe";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 bg-secondary/60 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono w-6 text-right">{score}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DNNAnalysisPage() {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAnalysis = useCallback((selectedFile: File) => {
    if (!isAcceptedFile(selectedFile)) {
      setError(`Unsupported format. Accepted: ${ACCEPTED_EXTS.join(", ")}`);
      return;
    }
    setError(null);
    setFile(selectedFile);
    setStatus("scanning");
    setProgress(0);

    let p = 0;
    timerRef.current = setInterval(() => {
      p += Math.random() * 8 + 4;
      if (p >= 100) {
        p = 100;
        clearInterval(timerRef.current!);
        setProgress(100);
        setStatus("complete");
      } else {
        setProgress(Math.round(p));
      }
    }, 200);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) startAnalysis(selected);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) startAnalysis(dropped);
    },
    [startAnalysis],
  );

  const handleReset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("idle");
    setProgress(0);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const infectedCount = MOCK_LAYERS.filter((l) => l.status === "Infected").length;
  const suspiciousCount = MOCK_LAYERS.filter((l) => l.status === "Suspicious").length;
  const overallThreat = infectedCount > 0 ? "Infected" : suspiciousCount > 0 ? "Suspicious" : "Clean";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DNN Analyzer</h1>
          <p className="text-muted-foreground text-sm">
            Scan neural network model files for weight-based steganographic payloads.
          </p>
        </div>
        {status === "complete" && (
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RefreshCw className="h-4 w-4" /> New Scan
          </Button>
        )}
      </div>

      {/* ── Improvement 1: Model Upload ──────────────────────────────────── */}
      {status === "idle" && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Upload Model File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 flex flex-col items-center gap-4 cursor-pointer transition-all
                ${dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-primary/50 hover:bg-secondary/30"
                }`}
            >
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Brain className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium">Drop your model file here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse — supports{" "}
                  <span className="font-mono text-xs">.h5 .pt .pth .onnx .pb .pkl .bin</span>
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_EXTS.join(",")}
                onChange={handleFileChange}
              />
            </div>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-sm text-threat">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scanning state */}
      {status === "scanning" && (
        <Card className="glass-card border-border/50">
          <CardContent className="p-8 flex flex-col items-center gap-6">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Brain className="h-7 w-7 text-primary" />
              </div>
            </div>
            <div className="text-center space-y-1 w-full max-w-xs">
              <p className="font-semibold">Analyzing {file?.name}</p>
              <p className="text-sm text-muted-foreground">Inspecting layer weights for anomalies…</p>
              <Progress value={progress} className="mt-3 h-1.5" />
              <p className="text-xs text-muted-foreground font-mono mt-1">{progress}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {status === "complete" && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "File",       value: file?.name ?? MOCK_META.name,  Icon: FileCode2   },
              { label: "Parameters", value: MOCK_META.parameters,          Icon: Cpu         },
              { label: "Layers",     value: String(MOCK_META.layers),      Icon: Layers      },
              { label: "Threat",     value: overallThreat,                 Icon: overallThreat === "Infected" ? ShieldAlert : ShieldCheck },
            ].map(({ label, value, Icon }) => (
              <Card key={label} className="glass-card border-border/50">
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Icon className={`h-4 w-4 ${
                    label === "Threat" && overallThreat === "Infected"
                      ? "text-threat"
                      : label === "Threat" && overallThreat === "Suspicious"
                      ? "text-warning"
                      : "text-primary"
                  }`} />
                </CardHeader>
                <CardContent className="pt-0">
                  <p className={`font-semibold text-sm truncate ${
                    label === "Threat" && overallThreat === "Infected"
                      ? "text-threat"
                      : label === "Threat" && overallThreat === "Suspicious"
                      ? "text-warning"
                      : ""
                  }`}>
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Improvement 2: Weight distribution chart ──────────────── */}
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Weight Distribution Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Kurtosis deviation from Gaussian baseline (≥ 6.0 flags abnormal weight clustering consistent with steganographic encoding).
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={MOCK_WEIGHT_DIST} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,30%,16%)" />
                    <XAxis
                      dataKey="layer"
                      tick={{ fontSize: 11, fill: "hsl(215,20%,55%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(215,20%,55%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(222,47%,8%)",
                        border: "1px solid hsl(222,30%,16%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number, name: string) => [
                        value.toFixed(2),
                        name === "kurtosis" ? "Kurtosis" : name === "stddev" ? "Std Dev" : "Mean",
                      ]}
                    />
                    <ReferenceLine y={6} stroke="hsl(38,92%,50%)" strokeDasharray="4 4" label={{ value: "Threshold", position: "right", fontSize: 10, fill: "hsl(38,92%,50%)" }} />
                    <Bar dataKey="kurtosis" name="kurtosis" radius={[3, 3, 0, 0]}
                      fill="hsl(187,92%,55%)"
                      // Color bars above the threshold differently
                      // recharts doesn't support per-bar color via a single fill so we rely
                      // on the reference line as the visual cue.
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ── Improvement 3: Layer-by-layer analysis table ──────────── */}
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Layer Analysis Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-muted-foreground">ID</TableHead>
                    <TableHead className="text-muted-foreground">Layer</TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Params</TableHead>
                    <TableHead className="text-muted-foreground">Entropy</TableHead>
                    <TableHead className="text-muted-foreground">Anomaly</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_LAYERS.map((layer) => (
                    <TableRow
                      key={layer.id}
                      className={`border-border/20 hover:bg-secondary/30 ${
                        layer.status === "Infected" ? "bg-threat/5" : ""
                      }`}
                    >
                      <TableCell className="font-mono text-xs text-primary">{layer.id}</TableCell>
                      <TableCell className="font-mono text-xs">{layer.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{layer.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{layer.params}</TableCell>
                      <TableCell className="font-mono text-xs">{layer.entropy.toFixed(2)}</TableCell>
                      <TableCell><AnomalyBar score={layer.anomalyScore} /></TableCell>
                      <TableCell><StatusBadge status={layer.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {infectedCount > 0 && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-threat/8 border border-threat/20">
                  <ShieldAlert className="h-5 w-5 text-threat shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-threat">Steganographic payload detected</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Layer <span className="font-mono text-threat">fc2</span> exhibits high kurtosis (9.8) and entropy deviation
                      consistent with LSB weight encoding. Recommend model quarantine.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
