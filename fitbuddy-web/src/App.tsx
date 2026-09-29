import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Dumbbell,
  Flame,
  HeartPulse,
  Home,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';

type Goal = 'Build strength' | 'Move more' | 'Feel better' | 'Train for an event';
type Intensity = 'Gentle' | 'Steady' | 'Challenging';
type Profile = {
  id: string;
  name: string;
  email: string;
  age: number;
  weight: number;
  goal: Goal;
  intensity: Intensity;
  createdAt: string;
};
type Exercise = { name: string; sets: string; reps: string; rest: string };
type WorkoutDay = {
  day: string;
  dateLabel: string;
  focus: string;
  duration: number;
  warmup: string;
  exercises: Exercise[];
  cooldown: string;
  completed: boolean;
};
type Plan = { days: WorkoutDay[]; nutritionTip: string; updatedAt: string; revision: number };
type Feedback = { id: string; rating: number; note: string; createdAt: string };
type UserRecord = { profile: Profile; plan: Plan; feedback: Feedback[] };

const STORE_KEY = 'fitbuddy-users-v1';
const ACTIVE_KEY = 'fitbuddy-active-v1';

const goals: Goal[] = ['Build strength', 'Move more', 'Feel better', 'Train for an event'];
const intensities: Intensity[] = ['Gentle', 'Steady', 'Challenging'];

function makePlan(profile: Pick<Profile, 'goal' | 'intensity'>, revision = 1): Plan {
  const harder = profile.intensity === 'Challenging';
  const gentler = profile.intensity === 'Gentle';
  const multiplier = harder ? 1.16 : gentler ? 0.86 : 1;
  const baseExercises: Record<string, Exercise[]> = {
    'Full body': [
      { name: 'Tempo squat', sets: harder ? '4' : '3', reps: '8–10', rest: '60 sec' },
      { name: 'Incline push-up', sets: '3', reps: '8–12', rest: '45 sec' },
      { name: 'Single-arm row', sets: '3', reps: '10 / side', rest: '45 sec' },
    ],
    'Lower body': [
      { name: 'Goblet squat', sets: '3', reps: '10', rest: '60 sec' },
      { name: 'Reverse lunge', sets: '3', reps: '8 / side', rest: '45 sec' },
      { name: 'Glute bridge', sets: '3', reps: '12', rest: '30 sec' },
    ],
    'Upper body': [
      { name: 'Knee or full push-up', sets: '3', reps: '8–10', rest: '45 sec' },
      { name: 'Bent-over row', sets: '3', reps: '10', rest: '45 sec' },
      { name: 'Pike press', sets: '2', reps: '8', rest: '45 sec' },
    ],
    Cardio: [
      { name: 'Brisk walk', sets: '1', reps: '12 min', rest: 'As needed' },
      { name: 'Fast feet', sets: '6', reps: '30 sec', rest: '30 sec' },
      { name: 'Easy walk', sets: '1', reps: '8 min', rest: 'As needed' },
    ],
    Mobility: [
      { name: 'World’s greatest stretch', sets: '2', reps: '5 / side', rest: '20 sec' },
      { name: '90/90 switches', sets: '2', reps: '8 / side', rest: '20 sec' },
      { name: 'Wall angels', sets: '2', reps: '10', rest: '20 sec' },
    ],
  };
  const sequence = [
    ['Mon', 'Full body', 32],
    ['Tue', 'Mobility', 18],
    ['Wed', 'Lower body', 30],
    ['Thu', 'Cardio', 28],
    ['Fri', 'Upper body', 30],
    ['Sat', 'Full body', 38],
    ['Sun', 'Mobility', 20],
  ] as const;
  const focusCopy: Record<string, string> = {
    'Full body': 'Build a capable base',
    Mobility: 'Make room to move',
    'Lower body': 'Power from the ground up',
    Cardio: 'Find your steady rhythm',
    'Upper body': 'Strong, tall, supported',
  };
  const days = sequence.map(([day, focus, duration], index) => ({
    day,
    dateLabel: ['Today', 'Tomorrow', 'Wed 18', 'Thu 19', 'Fri 20', 'Sat 21', 'Sun 22'][index],
    focus: focusCopy[focus],
    duration: Math.round(duration * multiplier),
    warmup: focus === 'Mobility' ? '2 min of relaxed breathing' : '3 min easy movement + joint circles',
    exercises: baseExercises[focus].map((exercise) => ({ ...exercise })),
    cooldown: focus === 'Cardio' ? 'Walk until your breathing settles' : '2 min slow breathing and a long stretch',
    completed: false,
  }));
  return {
    days,
    nutritionTip: profile.goal === 'Build strength'
      ? 'Pair your training with a protein-rich anchor at each meal. Think yogurt, eggs, tofu, beans, or fish.'
      : 'Build your plate around color, protein, and a glass of water. Small, repeatable choices support the whole week.',
    updatedAt: new Date().toISOString(),
    revision,
  };
}

function readUsers(): UserRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type FitnessContextValue = {
  users: UserRecord[];
  activeUser: UserRecord | null;
  activeId: string | null;
  storageError: boolean;
  createUser: (details: Omit<Profile, 'id' | 'createdAt'>) => Promise<void>;
  toggleDay: (index: number) => void;
  revisePlan: () => void;
  submitFeedback: (rating: number, note: string) => void;
  switchUser: (id: string) => void;
};
const FitnessContext = createContext<FitnessContextValue | null>(null);

function useFitness() {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('FitBuddy context is missing');
  return context;
}

function FitnessProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const loaded = readUsers();
    const savedId = localStorage.getItem(ACTIVE_KEY);
    setUsers(loaded);
    setActiveId(savedId && loaded.some((user) => user.profile.id === savedId) ? savedId : loaded[0]?.profile.id ?? null);
  }, []);

  useEffect(() => {
    if (!users.length) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(users));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      setStorageError(true);
    }
  }, [users, activeId]);

  const activeUser = useMemo(() => users.find((user) => user.profile.id === activeId) ?? null, [users, activeId]);
  const createUser = async (details: Omit<Profile, 'id' | 'createdAt'>) => {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const profile: Profile = { ...details, id: `user-${Date.now()}`, createdAt: new Date().toISOString() };
    const record: UserRecord = { profile, plan: makePlan(profile), feedback: [] };
    setUsers((current) => [record, ...current]);
    setActiveId(profile.id);
  };
  const updateActive = (updater: (user: UserRecord) => UserRecord) => {
    setUsers((current) => current.map((user) => user.profile.id === activeId ? updater(user) : user));
  };
  const toggleDay = (index: number) => updateActive((user) => ({
    ...user,
    plan: { ...user.plan, days: user.plan.days.map((day, dayIndex) => dayIndex === index ? { ...day, completed: !day.completed } : day) },
  }));
  const revisePlan = () => updateActive((user) => ({ ...user, plan: makePlan(user.profile, user.plan.revision + 1) }));
  const submitFeedback = (rating: number, note: string) => updateActive((user) => ({
    ...user,
    feedback: [{ id: `feedback-${Date.now()}`, rating, note, createdAt: new Date().toISOString() }, ...user.feedback],
  }));
  const switchUser = (id: string) => setActiveId(id);
  return (
    <FitnessContext.Provider value={{ users, activeUser, activeId, storageError, createUser, toggleDay, revisePlan, submitFeedback, switchUser }}>
      {children}
    </FitnessContext.Provider>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 w-fit" data-testid="link-brand">
      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground shadow-sm">
        <Activity size={21} strokeWidth={2.5} />
      </span>
      <span className="font-bold tracking-[-.04em] text-lg">fitbuddy<span className="text-accent">.</span></span>
    </Link>
  );
}

const navItems = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/plan', label: 'My plan', icon: CalendarDays },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/coach', label: 'Coach view', icon: Users },
];

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { activeUser, users } = useFitness();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-sidebar px-5 py-7 text-sidebar-foreground md:flex">
        <Brand />
        <div className="mt-14 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-white/5 p-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            {activeUser?.profile.name.slice(0, 1).toUpperCase() ?? <UserRound size={17} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{activeUser?.profile.name ?? 'Your space'}</p>
            <p className="font-mono text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/55">{activeUser ? 'Active profile' : 'Get started'}</p>
          </div>
        </div>
        <nav className="mt-10 space-y-2" aria-label="Main navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const selected = location === href;
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${selected ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/65 hover:bg-white/8 hover:text-sidebar-foreground'}`}>
                <Icon size={18} />
                {label}
                {selected && <ChevronRight className="ml-auto" size={16} />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sidebar-primary"><Sparkles size={15} /><span className="font-mono text-[10px] uppercase tracking-[.13em]">AI-crafted</span></div>
          <p className="text-xs leading-relaxed text-sidebar-foreground/60">A clear starting point, shaped around your actual week.</p>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-background/92 px-5 py-4 backdrop-blur md:hidden">
        <Brand />
        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-lg p-2 hover:bg-muted" data-testid="button-mobile-menu" aria-label="Open navigation">
          {mobileOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        {mobileOpen && (
          <div className="absolute left-0 right-0 top-full border-b border-border bg-background p-4 shadow-lg">
            <nav className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-mobile-${label.toLowerCase().replace(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === href ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <Icon size={18} />{label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main className="min-h-[100dvh] md:ml-[250px]">
        <div className="mx-auto max-w-[1320px] px-5 py-7 sm:px-8 md:px-12 md:py-10">{children}</div>
      </main>
      {users.length > 0 && <div className="fixed bottom-4 right-4 z-10 hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-card md:flex"><span className="size-2 rounded-full bg-primary" />Saved locally</div>}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end animate-rise">
      <div>
        <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[.2em] text-primary"><span className="size-1.5 rounded-full bg-accent" />{eyebrow}</p>
        <h1 className="max-w-3xl font-sans text-3xl font-extrabold tracking-[-.06em] text-foreground sm:text-4xl md:text-[3.1rem] md:leading-[1.06]">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyWelcome() {
  const [location, setLocation] = useLocation();
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-sidebar p-7 text-sidebar-foreground shadow-lift sm:p-12 md:p-16 animate-rise">
      <div className="absolute -right-24 -top-24 size-72 rounded-full border-[34px] border-sidebar-primary/15" />
      <div className="absolute bottom-[-100px] right-[18%] size-64 rounded-full border-[22px] border-accent/15" />
      <div className="relative max-w-2xl">
        <div className="mb-8 flex size-14 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"><Zap size={27} /></div>
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[.22em] text-sidebar-primary">A better week starts here</p>
        <h1 className="max-w-xl text-4xl font-extrabold leading-[1.02] tracking-[-.07em] sm:text-6xl">Your next seven days, made clear.</h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-sidebar-foreground/70">Tell us a little about yourself. FitBuddy will shape a realistic routine you can actually come back to.</p>
        <button type="button" onClick={() => setLocation('/setup')} className="mt-9 inline-flex items-center gap-3 rounded-xl bg-sidebar-primary px-5 py-3.5 text-sm font-bold text-sidebar-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-start-setup">
          Build my week <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function SetupForm() {
  const [, setLocation] = useLocation();
  const { createUser } = useFitness();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('31');
  const [weight, setWeight] = useState('72');
  const [goal, setGoal] = useState<Goal>('Feel better');
  const [intensity, setIntensity] = useState<Intensity>('Steady');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Add your name and email to continue.'); return; }
    if (Number(age) < 13 || Number(age) > 100) { setError('Enter an age between 13 and 100.'); return; }
    setSaving(true); setError('');
    await createUser({ name: name.trim(), email: email.trim(), age: Number(age), weight: Number(weight), goal, intensity });
    setSaving(false); setLocation('/');
  };
  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <button type="button" onClick={() => setLocation('/')} className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="button-back-home"><ChevronRight className="rotate-180" size={16} /> Back</button>
      <div className="mb-8">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[.2em] text-primary">Let’s make it yours</p>
        <h1 className="text-4xl font-extrabold tracking-[-.06em] sm:text-5xl">A plan that respects<br /><span className="text-primary">your actual life.</span></h1>
        <p className="mt-4 max-w-xl text-muted-foreground">No perfect weeks required. FitBuddy uses your answers to set a useful pace, then leaves room for being human.</p>
      </div>
      <form onSubmit={submit} className="rounded-[1.75rem] border border-card-border bg-card p-6 shadow-card sm:p-9">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" value={name} onChange={setName} placeholder="Maya Chen" testId="input-name" />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="maya@example.com" testId="input-email" />
          <Field label="Age" type="number" value={age} onChange={setAge} testId="input-age" />
          <Field label="Weight (kg)" type="number" value={weight} onChange={setWeight} testId="input-weight" />
        </div>
        <div className="mt-8">
          <p className="mb-3 text-sm font-bold">What are you moving toward?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {goals.map((item) => <Choice key={item} selected={goal === item} onClick={() => setGoal(item)} label={item} testId={`choice-goal-${item.toLowerCase().replaceAll(' ', '-')}`} />)}
          </div>
        </div>
        <div className="mt-8">
          <p className="mb-3 text-sm font-bold">How should it feel?</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {intensities.map((item) => <Choice key={item} selected={intensity === item} onClick={() => setIntensity(item)} label={item} testId={`choice-intensity-${item.toLowerCase()}`} />)}
          </div>
        </div>
        {error && <div className="mt-6 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive" data-testid="status-setup-error">{error}</div>}
        <button type="submit" disabled={saving} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70" data-testid="button-create-plan">
          {saving ? <><LoaderCircle size={17} className="animate-spin" /> Shaping your week...</> : <><Sparkles size={17} /> Create my AI-crafted plan</>}
        </button>
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Saved only in this browser · No account needed</p>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', testId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; testId: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary" data-testid={testId} /></label>;
}

function Choice({ selected, onClick, label, testId }: { selected: boolean; onClick: () => void; label: string; testId: string }) {
  return <button type="button" onClick={onClick} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${selected ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/45 hover:text-foreground'}`} data-testid={testId}>{label}<span className={`flex size-5 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{selected && <Check size={12} strokeWidth={3} />}</span></button>;
}

function HomePage() {
  const { activeUser, storageError } = useFitness();
  if (!activeUser) return <EmptyWelcome />;
  const { profile, plan } = activeUser;
  const completed = plan.days.filter((day) => day.completed).length;
  const nextIndex = plan.days.findIndex((day) => !day.completed);
  const next = plan.days[nextIndex === -1 ? 0 : nextIndex];
  return (
    <div>
      {storageError && <div className="mb-5 flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive" data-testid="status-storage-error">Your browser storage is full. Changes may not persist after refresh.</div>}
      <PageIntro eyebrow="Your week at a glance" title={`Good to see you, ${profile.name.split(' ')[0]}.`} description={`${profile.goal} · ${profile.intensity} pace`} action={<Link href="/plan" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3 transition-all" data-testid="link-see-plan">See full plan <ArrowRight size={17} /></Link>} />
      <div className="grid gap-5 lg:grid-cols-[1.45fr_.85fr]">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-primary p-7 text-primary-foreground shadow-lift sm:p-9 animate-rise delay-1">
          <div className="absolute -right-12 -top-16 size-60 rounded-full border-[28px] border-primary-foreground/10" />
          <div className="relative">
            <div className="flex items-center justify-between"><span className="rounded-full bg-primary-foreground/12 px-3 py-1 font-mono text-[10px] uppercase tracking-[.16em]">Up next · {next.dateLabel}</span><Target size={21} className="text-secondary" /></div>
            <h2 className="mt-10 max-w-md text-3xl font-extrabold tracking-[-.06em] sm:text-4xl">{next.focus}</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-primary-foreground/70">{next.exercises.length} movements · {next.duration} minutes · {next.warmup}</p>
            <Link href="/plan" className="mt-9 inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-bold text-secondary-foreground transition-transform hover:-translate-y-0.5" data-testid="link-start-workout"><Play size={16} fill="currentColor" /> Start workout</Link>
          </div>
        </section>
        <section className="rounded-[1.75rem] border border-card-border bg-card p-7 shadow-card animate-rise delay-2">
          <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Week rhythm</p><Flame size={19} className="text-accent" /></div>
          <div className="mt-8 flex items-end gap-3"><span className="text-6xl font-extrabold tracking-[-.08em] text-foreground">{completed}</span><span className="pb-2 text-sm font-semibold text-muted-foreground">of 7 complete</span></div>
          <div className="mt-7 flex gap-1.5">{plan.days.map((day, index) => <div key={day.day} className="flex-1"><div className={`h-2 rounded-full ${day.completed ? 'bg-primary' : index === nextIndex ? 'bg-secondary' : 'bg-muted'}`} /><p className="mt-2 text-center font-mono text-[9px] text-muted-foreground">{day.day}</p></div>)}</div>
          <p className="mt-7 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">{completed === 0 ? 'One good session changes the shape of a week.' : completed === 7 ? 'You gave this week your full attention.' : 'Keep the thread going. Consistency is built one check at a time.'}</p>
        </section>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Link href="/plan" className="group rounded-[1.5rem] border border-card-border bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-lift animate-rise delay-3" data-testid="card-plan-preview">
          <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary/25 text-foreground"><ClipboardList size={19} /></span><ArrowRight size={17} className="text-muted-foreground transition-transform group-hover:translate-x-1" /></div>
          <h3 className="mt-8 text-xl font-extrabold tracking-[-.04em]">Your full plan</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Seven days of clear sessions, warmups, and cooldowns.</p>
        </Link>
        <div className="rounded-[1.5rem] border border-card-border bg-card p-6 shadow-card animate-rise delay-4">
          <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><HeartPulse size={19} /></span><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Fuel note</span></div>
          <p className="mt-8 text-sm font-semibold leading-6 text-foreground">{plan.nutritionTip}</p>
        </div>
      </div>
    </div>
  );
}

function PlanPage() {
  const { activeUser, toggleDay } = useFitness();
  const [expanded, setExpanded] = useState(0);
  if (!activeUser) return <EmptyWelcome />;
  const { plan, profile } = activeUser;
  return (
    <div>
      <PageIntro eyebrow="Your AI-crafted week" title="A plan with a pulse." description={`Built for ${profile.goal.toLowerCase()} at a ${profile.intensity.toLowerCase()} pace. Adjust the day, not your expectations.`} action={<span className="flex items-center gap-2 rounded-full bg-primary/8 px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-primary"><Sparkles size={13} /> Revision {plan.revision}</span>} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <section className="space-y-3">
          {plan.days.map((day, index) => <WorkoutRow key={day.day} day={day} index={index} expanded={expanded === index} onExpand={() => setExpanded(expanded === index ? -1 : index)} onToggle={() => toggleDay(index)} />)}
        </section>
        <aside className="space-y-5">
          <div className="rounded-[1.5rem] bg-secondary p-6 text-secondary-foreground shadow-card animate-rise delay-2">
            <div className="flex items-center gap-2"><HeartPulse size={18} /><p className="font-mono text-[10px] uppercase tracking-[.16em]">Recovery matters</p></div>
            <p className="mt-7 text-xl font-extrabold leading-7 tracking-[-.04em]">“{plan.nutritionTip}”</p>
            <p className="mt-5 text-xs leading-5 opacity-70">A useful nudge, not a rulebook.</p>
          </div>
          <div className="rounded-[1.5rem] border border-card-border bg-card p-6 shadow-card animate-rise delay-3">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">The shape of it</p>
            <div className="mt-7 space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Active days</span><strong>5 / 7</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Average session</span><strong>{Math.round(plan.days.reduce((a, b) => a + b.duration, 0) / 7)} min</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Equipment</span><strong>Bodyweight</strong></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkoutRow({ day, index, expanded, onExpand, onToggle }: { day: WorkoutDay; index: number; expanded: boolean; onExpand: () => void; onToggle: () => void }) {
  return (
    <div className={`overflow-hidden rounded-[1.35rem] border bg-card shadow-card transition-all animate-rise ${day.completed ? 'border-primary/35' : 'border-card-border'}`} style={{ animationDelay: `${index * 55}ms` }}>
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <button type="button" onClick={onToggle} className={`flex size-11 shrink-0 items-center justify-center rounded-xl border transition-all ${day.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary'}`} data-testid={`button-complete-${day.day.toLowerCase()}`} aria-label={`${day.completed ? 'Uncomplete' : 'Complete'} ${day.day} workout`}>{day.completed ? <Check size={20} strokeWidth={3} /> : <span className="font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>}</button>
        <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left" data-testid={`button-expand-${day.day.toLowerCase()}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-primary">{day.day}</span><span className="text-xs text-muted-foreground">{day.duration} min</span>{day.completed && <span className="text-xs font-bold text-primary">Complete</span>}</div>
          <h3 className={`mt-1 truncate text-base font-extrabold tracking-[-.03em] sm:text-lg ${day.completed ? 'text-muted-foreground line-through decoration-primary/50' : ''}`}>{day.focus}</h3>
        </button>
        <ChevronRight size={18} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>
      {expanded && <div className="border-t border-border/80 px-5 pb-6 pt-5 sm:px-20 animate-pop">
        <p className="mb-5 text-xs text-muted-foreground"><span className="font-bold text-foreground">Warm up · </span>{day.warmup}</p>
        <div className="space-y-2">{day.exercises.map((exercise) => <div key={exercise.name} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl bg-muted/60 px-4 py-3 sm:grid-cols-[1fr_75px_90px_90px]"><span className="text-sm font-bold">{exercise.name}</span><span className="font-mono text-[10px] text-muted-foreground">{exercise.sets} sets</span><span className="font-mono text-[10px] text-muted-foreground">{exercise.reps}</span><span className="hidden font-mono text-[10px] text-muted-foreground sm:block">{exercise.rest}</span></div>)}</div>
        <p className="mt-5 text-xs text-muted-foreground"><span className="font-bold text-foreground">Cool down · </span>{day.cooldown}</p>
      </div>}
    </div>
  );
}

function ProgressPage() {
  const { activeUser, submitFeedback } = useFitness();
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  if (!activeUser) return <EmptyWelcome />;
  const completed = activeUser.plan.days.filter((day) => day.completed);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!rating || !note.trim()) return; submitFeedback(rating, note.trim()); setRating(0); setNote(''); setSaved(true); window.setTimeout(() => setSaved(false), 2800); };
  return (
    <div>
      <PageIntro eyebrow="Proof you showed up" title="Progress, without the pressure." description="A quiet record of the work you’ve made time for. That counts." />
      <div className="grid gap-5 md:grid-cols-3">
        <StatCard icon={CheckCircle2} label="Sessions complete" value={String(completed.length)} note="this plan" accent="primary" />
        <StatCard icon={Flame} label="Minutes moved" value={String(completed.reduce((total, day) => total + day.duration, 0))} note="earned this week" accent="accent" />
        <StatCard icon={Target} label="Plan consistency" value={`${Math.round((completed.length / 7) * 100)}%`} note={completed.length ? 'keep the rhythm' : 'ready when you are'} accent="secondary" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-[1.5rem] border border-card-border bg-card p-6 shadow-card sm:p-8">
          <div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Completed history</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-.05em]">Your movement log</h2></div><Activity className="text-primary" size={22} /></div>
          {completed.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-border p-8 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary/30"><Dumbbell size={20} /></span><p className="mt-4 font-bold">Your first check-in is waiting.</p><p className="mt-2 text-sm text-muted-foreground">Complete a session in My plan and it will appear here.</p><Link href="/plan" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-progress-plan">Open my plan <ArrowRight size={16} /></Link></div> : <div className="mt-8 space-y-2">{completed.map((day) => <div key={day.day} className="flex items-center gap-4 rounded-xl bg-muted/55 p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Check size={16} strokeWidth={3} /></span><div className="flex-1"><p className="text-sm font-bold">{day.focus}</p><p className="mt-1 text-xs text-muted-foreground">{day.day} · {day.duration} minutes</p></div><span className="font-mono text-[10px] uppercase tracking-[.1em] text-primary">Done</span></div>)}</div>}
        </section>
        <section className="rounded-[1.5rem] bg-sidebar p-6 text-sidebar-foreground shadow-card sm:p-8">
          <div className="flex items-center gap-2 text-sidebar-primary"><Send size={17} /><p className="font-mono text-[10px] uppercase tracking-[.16em]">Coach notes</p></div>
          <h2 className="mt-7 text-2xl font-extrabold leading-tight tracking-[-.05em]">How did the week feel?</h2>
          <p className="mt-3 text-sm leading-6 text-sidebar-foreground/65">A quick note helps shape your next plan.</p>
          <form onSubmit={submit} className="mt-7">
            <div className="flex gap-2" aria-label="Rate your week">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} className={`flex size-9 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${value <= rating ? 'border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground' : 'border-sidebar-border text-sidebar-foreground/45 hover:border-sidebar-primary/70'}`} data-testid={`button-rating-${value}`}>{value}</button>)}</div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="One thing I noticed..." className="mt-4 min-h-28 w-full resize-none rounded-xl border border-sidebar-border bg-white/5 p-4 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/35 focus:border-sidebar-primary" data-testid="textarea-feedback" />
            <button type="submit" disabled={!rating || !note.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3 text-sm font-bold text-sidebar-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-feedback"><Send size={15} /> Send note</button>
            {saved && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-sidebar-primary animate-pop" data-testid="status-feedback-success"><CheckCircle2 size={14} /> Saved for your coach view.</p>}
          </form>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, accent }: { icon: typeof Activity; label: string; value: string; note: string; accent: 'primary' | 'accent' | 'secondary' }) {
  return <div className="rounded-[1.5rem] border border-card-border bg-card p-6 shadow-card animate-rise"><div className={`flex size-10 items-center justify-center rounded-xl ${accent === 'primary' ? 'bg-primary/10 text-primary' : accent === 'accent' ? 'bg-accent/12 text-accent' : 'bg-secondary/30 text-secondary-foreground'}`}><Icon size={20} /></div><p className="mt-7 text-xs font-bold text-muted-foreground">{label}</p><div className="mt-1 flex items-baseline gap-2"><span className="text-4xl font-extrabold tracking-[-.07em]">{value}</span><span className="text-xs text-muted-foreground">{note}</span></div></div>;
}

function CoachPage() {
  const { users, activeId, activeUser, switchUser, revisePlan } = useFitness();
  const [revised, setRevised] = useState(false);
  const revise = () => { revisePlan(); setRevised(true); window.setTimeout(() => setRevised(false), 2500); };
  return (
    <div>
      <PageIntro eyebrow="Coach workspace" title="See the whole picture." description="Switch between saved profiles, review the rhythm, and give a plan a fresh starting point." action={<span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground"><Settings2 size={13} /> Local admin view</span>} />
      {users.length === 0 ? <div className="rounded-[1.75rem] border border-dashed border-border bg-card p-12 text-center shadow-card animate-rise"><Users size={28} className="mx-auto text-muted-foreground" /><h2 className="mt-5 text-xl font-extrabold">No saved profiles yet.</h2><p className="mt-2 text-sm text-muted-foreground">Create a plan first, then come back to see it here.</p><Link href="/setup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="link-create-first-profile"><Plus size={17} /> Add a profile</Link></div> : <div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
        <section className="rounded-[1.5rem] border border-card-border bg-card p-5 shadow-card"><div className="flex items-center justify-between px-2"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Saved people</p><span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px]">{users.length}</span></div><div className="mt-5 space-y-2">{users.map((user) => { const done = user.plan.days.filter((day) => day.completed).length; return <button type="button" key={user.profile.id} onClick={() => switchUser(user.profile.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${activeId === user.profile.id ? 'bg-primary/9 ring-1 ring-primary/20' : 'hover:bg-muted'}`} data-testid={`button-switch-user-${user.profile.id}`}><span className={`flex size-10 items-center justify-center rounded-full font-bold text-sm ${activeId === user.profile.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>{user.profile.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{user.profile.name}</span><span className="block text-xs text-muted-foreground">{done}/7 complete</span></span>{activeId === user.profile.id && <Check size={16} className="text-primary" />}</button>; })}</div><Link href="/setup" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary" data-testid="link-add-profile"><Plus size={15} /> Add another profile</Link></section>
        {activeUser && <section className="rounded-[1.5rem] bg-sidebar p-6 text-sidebar-foreground shadow-lift sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-primary">Selected profile</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.06em]">{activeUser.profile.name}</h2><p className="mt-2 text-sm text-sidebar-foreground/60">{activeUser.profile.email} · {activeUser.profile.age} years · {activeUser.profile.weight} kg</p></div><span className="rounded-full bg-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/60">{activeUser.profile.intensity}</span></div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-sidebar-border bg-white/5 p-4"><p className="font-mono text-[10px] uppercase text-sidebar-foreground/50">Goal</p><p className="mt-2 text-sm font-bold">{activeUser.profile.goal}</p></div><div className="rounded-xl border border-sidebar-border bg-white/5 p-4"><p className="font-mono text-[10px] uppercase text-sidebar-foreground/50">Revision</p><p className="mt-2 text-sm font-bold">#{activeUser.plan.revision}</p></div><div className="rounded-xl border border-sidebar-border bg-white/5 p-4"><p className="font-mono text-[10px] uppercase text-sidebar-foreground/50">Feedback</p><p className="mt-2 text-sm font-bold">{activeUser.feedback.length} note{activeUser.feedback.length === 1 ? '' : 's'}</p></div></div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={revise} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3 text-sm font-bold text-sidebar-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-revise-plan"><RotateCcw size={16} /> Generate fresh revision</button><Link href="/plan" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sidebar-border px-4 py-3 text-sm font-bold text-sidebar-foreground hover:bg-white/8" data-testid="link-view-selected-plan">View plan <ArrowRight size={16} /></Link></div>
          {revised && <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-sidebar-primary animate-pop" data-testid="status-revision-success"><CheckCircle2 size={14} /> New plan revision saved locally.</p>}
          {activeUser.feedback.length > 0 && <div className="mt-9 border-t border-sidebar-border pt-6"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/50">Latest feedback</p><p className="mt-3 text-sm leading-6 text-sidebar-foreground/75">“{activeUser.feedback[0].note}”</p><p className="mt-3 text-xs text-sidebar-foreground/45">{activeUser.feedback[0].rating}/5 · {new Date(activeUser.feedback[0].createdAt).toLocaleDateString()}</p></div>}
        </section>}
      </div>}
    </div>
  );
}

function Router() {
  return <ErrorBoundary><Shell><Switch><Route path="/" component={HomePage} /><Route path="/setup" component={SetupForm} /><Route path="/plan" component={PlanPage} /><Route path="/progress" component={ProgressPage} /><Route path="/coach" component={CoachPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><FitnessProvider><Router /></FitnessProvider></WouterRouter>;
}

export default App;