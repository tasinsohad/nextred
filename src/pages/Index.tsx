import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Globe, Shield, Zap, BarChart3, ArrowRight, Check } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();

  const features = [
    {
      icon: Shield,
      title: 'True Reverse Proxy',
      description: 'SEO-friendly domain masking without iframes. Your URL stays clean while serving any content.',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Built on Cloudflare Workers for edge performance. Cache static assets automatically.',
    },
    {
      icon: BarChart3,
      title: 'Built-in Analytics',
      description: 'Track UTM parameters, Facebook Click ID, Google Click ID, and more.',
    },
    {
      icon: Globe,
      title: 'Multi-Domain Support',
      description: 'Manage up to 80+ domains per account. Add, edit, and remove domains instantly.',
    },
  ];

  const pricingFeatures = [
    'Unlimited domains',
    'Reverse proxy masking',
    'SSL/HTTPS support',
    'Analytics & tracking',
    'UTM parameter tracking',
    'Facebook & Google Click ID',
    'API access',
    'Priority support',
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">DomainMask Pro</span>
          </div>
          <div className="flex items-center gap-4">
            {loading ? null : user ? (
              <Button asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground text-sm mb-8">
            <Zap className="h-4 w-4" />
            Powered by Cloudflare Workers
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Professional Domain Masking
            <br />
            <span className="text-muted-foreground">Made Simple</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Keep your branded URLs while serving content from any source. 
            True reverse proxy technology, not iframes. SEO-friendly and secure.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-card">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Everything You Need</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A complete domain masking solution with enterprise-grade features
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="p-6 bg-background border border-border">
                <div className="p-3 bg-secondary w-fit mb-4">
                  <feature.icon className="h-6 w-6 text-secondary-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get started in three simple steps</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="font-semibold text-foreground mb-2">Add Your Domain</h3>
              <p className="text-sm text-muted-foreground">
                Enter your masked domain and target URL in the dashboard
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="font-semibold text-foreground mb-2">Configure DNS</h3>
              <p className="text-sm text-muted-foreground">
                Point your domain to our proxy using provided DNS settings
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="font-semibold text-foreground mb-2">Go Live</h3>
              <p className="text-sm text-muted-foreground">
                Your domain now serves content with full URL masking
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-card">
        <div className="container mx-auto max-w-xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Simple Pricing</h2>
            <p className="text-muted-foreground">Everything included, no hidden fees</p>
          </div>
          
          <div className="bg-background border border-border p-8">
            <div className="text-center mb-8">
              <div className="text-4xl font-bold text-foreground mb-2">
                $29<span className="text-lg text-muted-foreground">/mo</span>
              </div>
              <p className="text-muted-foreground">Professional Plan</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              {pricingFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
            
            <Button className="w-full" size="lg" asChild>
              <Link to="/auth">Start Free Trial</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-4">
              14-day free trial • No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary">
                <Globe className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold">DomainMask Pro</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} DomainMask Pro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
