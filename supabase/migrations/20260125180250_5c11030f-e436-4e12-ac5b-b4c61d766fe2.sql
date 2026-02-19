-- Create cloudflare_accounts table for storing user's Cloudflare credentials
CREATE TABLE public.cloudflare_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  cloudflare_email TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cloudflare_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own cloudflare accounts" 
ON public.cloudflare_accounts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cloudflare accounts" 
ON public.cloudflare_accounts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cloudflare accounts" 
ON public.cloudflare_accounts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cloudflare accounts" 
ON public.cloudflare_accounts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cloudflare_accounts_updated_at
BEFORE UPDATE ON public.cloudflare_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add cloudflare_account_id to domains table for linking
ALTER TABLE public.domains 
ADD COLUMN cloudflare_account_id UUID REFERENCES public.cloudflare_accounts(id) ON DELETE SET NULL;