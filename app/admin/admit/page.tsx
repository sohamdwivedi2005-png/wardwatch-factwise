"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, AlertTriangle } from "lucide-react";
import { useWard } from "@/store/wardwatch-store";
import { AppShell } from "@/components/layout/app-shell";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toaster";
import { wardForBed } from "@/lib/rules";

export default function AdmitPage() {
  return (
    <AppShell allow={["admin"]}>
      <AdmitForm />
    </AppShell>
  );
}

function AdmitForm() {
  const router = useRouter();
  const beds = useWard((s) => s.beds);
  const patients = useWard((s) => s.patients);
  const admit = useWard((s) => s.admitPatient);
  const user = useWard((s) => s.staff.find((x) => x.id === s.currentUserId)!);

  const freeBeds = beds.filter((b) => !b.patientId);
  const full = freeBeds.length === 0;

  const [name, setName] = React.useState("");
  const [age, setAge] = React.useState("");
  const [sex, setSex] = React.useState("M");
  const [phone, setPhone] = React.useState("");
  const [bedId, setBedId] = React.useState<number | "">(freeBeds[0]?.id ?? "");

  const ageNum = parseInt(age, 10);
  const dup = name.trim().length > 1 && patients.some(
    (p) => p.status === "admitted" && p.name.toLowerCase() === name.trim().toLowerCase() && p.age === ageNum
  );

  const nextDischarge = patients
    .filter((p) => p.status === "admitted" && p.clearance)
    .sort((a, b) => (a.clearance!.clearedAt < b.clearance!.clearedAt ? -1 : 1))[0];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast("Name is required.", { variant: "error" });
    if (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120) return toast("Age must be 0–120.", { variant: "error" });
    if (bedId === "") return toast("Select a free bed.", { variant: "error" });
    const r = admit({ name: name.trim(), age: ageNum, sex, phone: phone.trim() || undefined }, Number(bedId), user.id);
    if (!r.ok) return toast(r.error!, { variant: "error" });
    toast("Patient admitted", { variant: "success", description: `Bed ${bedId}` });
    router.push(`/patients/${r.patientId}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Admit Patient</h1>
        <p className="text-sm text-slate-500">{freeBeds.length} free bed{freeBeds.length === 1 ? "" : "s"} · MRN generated automatically.</p>
      </div>

      {full ? (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-semibold">Facility at full capacity (74/74)</p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Admission is disabled until a bed is freed.
            {nextDischarge && <> Next expected discharge: <b>{nextDischarge.name}</b> (Bed {nextDischarge.bedId}, cleared).</>}
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push("/admin/discharges")}>Go to discharge queue</Button>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohan Mehta" />
              {dup && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> A patient with this name and age is already admitted — possible duplicate.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="age">Age</Label>
                <Input id="age" inputMode="numeric" className="mt-1.5" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} placeholder="0–120" />
              </div>
              <div>
                <Label htmlFor="sex">Sex</Label>
                <Select id="sex" className="mt-1.5" value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bed">Free bed</Label>
              <Select id="bed" className="mt-1.5" value={bedId} onChange={(e) => setBedId(e.target.value ? Number(e.target.value) : "")}>
                {freeBeds.map((b) => (
                  <option key={b.id} value={b.id}>Bed {b.id} — Ward {wardForBed(b.id)}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="w-full"><UserPlus className="h-4 w-4" /> Admit patient</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
