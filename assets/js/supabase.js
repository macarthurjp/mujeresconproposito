const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdW55d2l5aXlpZGh5b2RzYmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk5OTYsImV4cCI6MjA5NzQ1NTk5Nn0.e0w2FTvxbeKmAIUBY-xKPgnG5Txy3JIpiHi6HSeoT68";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);