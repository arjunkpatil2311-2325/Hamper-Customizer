import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp,
  Gift, Heart, ImagePlus, Leaf, LoaderCircle, LockKeyhole, Minus, PackageCheck,
  Plus, Sparkles, Trash2, Truck, X, ClipboardList, MapPin, Phone, RefreshCw,
} from 'lucide-react';
import {
  getListAdminOrdersQueryKey, getListOrdersQueryKey, useCreateOrder, useGetAdminAccess, useListAdminOrders,
  useUpdateAdminOrderStatus, useListOrders, useListProducts, useRequestUploadUrl,
} from '@workspace/api-client-react';
import type { DeliveryAddress, HamperOrder, HamperOrderInput, PackagingOption, Product, OrderStatus } from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315c48',
    colorForeground: '#263a31',
    colorMutedForeground: '#68766e',
    colorDanger: '#a7433d',
    colorBackground: '#fbf8f1',
    colorInput: '#fffdf8',
    colorInputForeground: '#263a31',
    colorNeutral: '#d9d0c1',
    fontFamily: 'DM Sans',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f1] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-[0_24px_70px_rgba(40,55,45,.12)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263a31] font-display',
    headerSubtitle: 'text-[#68766e]',
    socialButtonsBlockButtonText: 'text-[#263a31] font-semibold',
    formFieldLabel: 'text-[#263a31] font-semibold',
    footerActionLink: 'text-[#315c48] font-semibold',
    footerActionText: 'text-[#68766e]',
    dividerText: 'text-[#68766e]',
    identityPreviewEditButton: 'text-[#315c48]',
    formFieldSuccessText: 'text-[#315c48]',
    alertText: 'text-[#a7433d]',
    logoBox: 'mb-2',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#ded6c9] bg-[#fffdf8] rounded-xl',
    formButtonPrimary: 'bg-[#315c48] hover:bg-[#274b3a] rounded-xl',
    formFieldInput: 'bg-[#fffdf8] border-[#d9d0c1] text-[#263a31] rounded-xl',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#e4ded3]',
    alert: 'bg-[#fbefed] border-[#edd5d1]',
    otpCodeFieldInput: 'bg-[#fffdf8] border-[#d9d0c1]',
    formFieldRow: 'mb-4',
    main: 'gap-4',
  },
};

function Brand({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`brand-lockup ${className}`.trim()} data-testid="link-home">
      <span className="brand-mark"><Gift size={19} strokeWidth={1.8} /></span>
      <span className="brand-word">hamper<span>hub</span><small>the personal art of giving</small></span>
    </Link>
  );
}

function Header() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const studioAccessQuery = useGetAdminAccess({
    query: { enabled: Boolean(isLoaded && isSignedIn), staleTime: 60_000 },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="page-shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/#collection" data-testid="link-collection">The collection</Link>
          <Link href="/build" data-testid="link-build">Make a hamper</Link>
          {isLoaded && isSignedIn && <Link href="/my-orders" data-testid="link-orders">My orders</Link>}
          {studioAccessQuery.data?.isAdmin && <Link href="/admin" data-testid="link-admin">Studio desk</Link>}
        </nav>
        <div className="header-actions">
          {isLoaded && isSignedIn ? (
            <>
              <span className="welcome-user">Hello, {user?.firstName || 'gifter'}</span>
              <button className="text-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
            </>
          ) : (
            <Link href="/sign-in" className="text-button sign-in-link" data-testid="link-sign-in">Sign in <ArrowUpRight size={15} /></Link>
          )}
          <Link href="/build" className="button button-dark header-cta" data-testid="button-start-hamper">Start a hamper <ArrowRight size={15} /></Link>
          <button aria-label="Toggle navigation" className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">
            {menuOpen ? <X size={21} /> : <ChevronDown size={21} />}
          </button>
        </div>
      </div>
      {menuOpen && <nav className="mobile-nav page-shell">
        <Link onClick={() => setMenuOpen(false)} href="/#collection" data-testid="mobile-link-collection">The collection</Link>
        <Link onClick={() => setMenuOpen(false)} href="/build" data-testid="mobile-link-build">Make a hamper</Link>
        {isSignedIn ? <Link onClick={() => setMenuOpen(false)} href="/my-orders" data-testid="mobile-link-orders">My orders</Link> : <Link onClick={() => setMenuOpen(false)} href="/sign-in" data-testid="mobile-link-sign-in">Sign in</Link>}
        {studioAccessQuery.data?.isAdmin && <Link onClick={() => setMenuOpen(false)} href="/admin" data-testid="mobile-link-admin">Studio desk</Link>}
      </nav>}
    </header>
  );
}

function SiteFooter() {
  return <footer className="site-footer">
    <div className="page-shell footer-main">
      <div><Brand /><p>Gifts that say, “I know you.”<br />Made thoughtfully, sent with care.</p></div>
      <div className="footer-links"><span className="eyebrow">A little more</span><Link href="/build" data-testid="footer-link-build">Create your hamper</Link><Link href="/my-orders" data-testid="footer-link-orders">Order history</Link><a href="mailto:hello@hamperhub.in" data-testid="footer-link-email">Write to our studio</a></div>
      <div className="footer-note"><span className="eyebrow">Made for one person</span><p>Every good gift begins with thinking of someone.</p><Heart size={18} strokeWidth={1.5} /></div>
    </div>
    <div className="page-shell footer-bottom"><span>© Hamper Hub Studio</span><span>Considered gifts, delivered across India</span></div>
  </footer>;
}

function Shell({ children }: { children: ReactNode }) {
  return <><Header />{children}<SiteFooter /></>;
}

function SkeletonGrid() {
  return <div className="product-grid" aria-label="Loading the collection">{[1, 2, 3, 4].map((i) => <div className="skeleton-card" key={i}><div className="skeleton-image" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>;
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  return <article className={`product-card reveal reveal-delay-${(index % 3) + 1}`} data-testid={`card-product-${product.id}`}>
    <div className="product-photo">
      <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" />
      {product.featured && <span className="product-ribbon">Studio favourite</span>}
      <span className="category-chip">{product.category.replace('-', ' ')}</span>
    </div>
    <div className="product-info">
      <div><h3>{product.name}</h3><p>{product.description}</p></div>
      <div className="product-price">{money.format(product.price)}</div>
    </div>
  </article>;
}

function Home() {
  const productsQuery = useListProducts();
  const products = productsQuery.data ?? [];
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  return <Shell>
    <main>
      <section className="hero">
        <div className="hero-photo" role="img" aria-label="An artfully arranged gift hamper with thoughtful treats" />
        <div className="hero-shade" />
        <div className="page-shell hero-content">
          <div className="hero-copy reveal">
            <span className="hero-kicker"><span className="kicker-line" /> A small studio for big feelings</span>
            <h1>Not just a gift.<br /><em>A little piece of</em><br />you, for them.</h1>
            <p>Choose the things they’ll love. We’ll bring them together beautifully, just for that one person.</p>
            <div className="hero-buttons">
              <Link href="/build" className="button button-cream" data-testid="button-build-hero">Build a personal hamper <ArrowRight size={16} /></Link>
              <Link href="/#collection" className="hero-discover" data-testid="link-discover">Explore the collection <ArrowDown size={15} /></Link>
            </div>
            <div className="hero-proof"><div className="proof-icon"><Heart size={16} /></div><span>Considered by hand.<br /><b>Made around them.</b></span></div>
          </div>
          <div className="hero-stamp" aria-hidden="true"><span>THE GOOD<br />GIFT CLUB</span><Sparkles className="stamp-star" size={21} strokeWidth={1.5} /></div>
        </div>
        <div className="hero-edge-note">A little more personal, always.</div>
      </section>

      <section className="intro-band">
        <div className="page-shell intro-layout">
          <span className="eyebrow">A note from the studio</span>
          <p className="intro-statement">The best gifts don’t come from a shelf.<br /><em>They come from knowing someone.</em></p>
          <span className="intro-mark"><Sparkles size={23} strokeWidth={1.3} /></span>
        </div>
      </section>

      <section id="collection" className="collection-section page-shell">
        <div className="section-heading">
          <div><span className="eyebrow">Collected with care</span><h2>Little things,<br /><em>big meaning.</em></h2></div>
          <p>A few lovely starting points. Make them yours, or find the right pieces to build something entirely their own.</p>
        </div>
        {productsQuery.isLoading ? <SkeletonGrid /> : productsQuery.isError ? (
          <div className="state-panel error-panel"><CircleHelp size={25} /><h3>Our shelves are taking a moment.</h3><p>We couldn’t load the collection just now.</p><button className="button button-dark" onClick={() => productsQuery.refetch()} data-testid="button-retry-products">Try again <ArrowRight size={15} /></button></div>
        ) : products.length === 0 ? (
          <div className="state-panel"><Gift size={28} /><h3>Something lovely is on its way.</h3><p>Our collection is being prepared. Please check back soon.</p></div>
        ) : <>
          {categories.length > 0 && <div className="category-notes">{categories.map((category) => <span key={category}>{category.replace('-', ' ')}</span>)}</div>}
          <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>
        </>}
        <div className="collection-cta"><span>Have someone in mind?</span><Link className="button button-dark" href="/build" data-testid="button-build-collection">Make something just for them <ArrowRight size={16} /></Link></div>
      </section>

      <section className="how-section">
        <div className="page-shell how-layout">
          <div className="how-heading"><span className="eyebrow">A thoughtful little ritual</span><h2>Easy to make.<br /><em>Lovely to receive.</em></h2><p>Four simple steps. One very personal parcel.</p><Link href="/build" className="text-link" data-testid="link-how-build">Begin your hamper <ArrowRight size={16} /></Link></div>
          <div className="steps-list">
            <div className="how-step"><span>01</span><div><h3>Think of them</h3><p>Choose a budget and start with what they enjoy.</p></div><Leaf size={21} /></div>
            <div className="how-step"><span>02</span><div><h3>Pick the good bits</h3><p>Mix their favourite treats, comforts and keepsakes.</p></div><Gift size={21} /></div>
            <div className="how-step"><span>03</span><div><h3>Add your words</h3><p>A name, a note, or a photo makes it theirs.</p></div><Heart size={21} /></div>
            <div className="how-step"><span>04</span><div><h3>Send a little joy</h3><p>Choose the day and place. We’ll take it from here.</p></div><Truck size={21} /></div>
          </div>
        </div>
      </section>
      <section className="closing-note page-shell"><Sparkles className="closing-asterisk" size={26} strokeWidth={1.3} /><p>For celebrations, just-because days,<br />and all the people who make life feel like home.</p><Link href="/build" className="button button-dark" data-testid="button-create-closing">Create their hamper <ArrowRight size={16} /></Link></section>
    </main>
  </Shell>;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  if (!isLoaded) return <div className="auth-loading"><div className="loading-orb" /><p>Opening your studio…</p></div>;
  if (!isSignedIn) return <Redirect to={`/sign-in?redirect_url=${encodeURIComponent(`${basePath}${location}`)}`} />;
  return <>{children}</>;
}

function OrderBuilder() {
  const productsQuery = useListProducts();
  const requestUpload = useRequestUploadUrl();
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState('5000');
  const [packagingOption, setPackagingOption] = useState<PackagingOption>('signature');
  const [personalizationName, setPersonalizationName] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [address, setAddress] = useState<DeliveryAddress>({ recipientName: '', recipientPhone: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', country: 'India' });
  const [photoPath, setPhotoPath] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [completeOrder, setCompleteOrder] = useState<HamperOrder | null>(null);
  const products = productsQuery.data ?? [];
  const chosen = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const subtotal = chosen.reduce((sum, product) => sum + product.price * quantities[product.id], 0);
  const packagingCharge = packagingOption === 'signature' ? 89 : packagingOption === 'celebration' ? 149 : 0;
  const deliveryCharge = 79;
  const estimatedTotal = subtotal + packagingCharge + deliveryCharge;
  const localToday = new Date();
  localToday.setMinutes(localToday.getMinutes() - localToday.getTimezoneOffset());
  const minimumDate = localToday.toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);

  const changeAddress = (key: keyof DeliveryAddress, value: string) => setAddress((current) => ({ ...current, [key]: value }));
  const changeQuantity = (product: Product, next: number) => setQuantities((current) => {
    const quantity = Math.max(0, Math.min(12, next));
    const updated = { ...current };
    if (quantity) updated[product.id] = quantity;
    else delete updated[product.id];
    return updated;
  });

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    setPhotoPath('');
    setPhotoName('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Please choose a JPEG, PNG or WebP image.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('That image is a little too large. Choose one under 5 MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' } });
      const response = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error('The photo could not be uploaded. Please try again.');
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPath(signed.objectPath);
      setPhotoName(file.name);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'We couldn’t upload that photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!chosen.length) {
      setFormError('Choose at least one lovely thing for the hamper.');
      document.getElementById('choose-items')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (estimatedTotal > Number(budget)) {
      setFormError('Your hamper total is over budget. Adjust the pieces or budget to continue.');
      return;
    }
    const input: HamperOrderInput = {
      items: chosen.map((product) => ({ productId: product.id, quantity: quantities[product.id] })),
      budget: Number(budget),
      packagingOption,
      ...(personalizationName.trim() ? { personalizationName: personalizationName.trim() } : {}),
      ...(giftMessage.trim() ? { giftMessage: giftMessage.trim() } : {}),
      ...(photoPath ? { photoObjectPath: photoPath } : {}),
      deliveryDate,
      deliveryAddress: address,
    };
    try {
      const saved = await createOrder.mutateAsync({ data: input });
      await queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      setCompleteOrder(saved);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'We couldn’t place the order just yet. Please try again.');
    }
  };

  if (completeOrder) return <Shell><main className="success-page page-shell">
    <div className="success-seal"><Check size={32} /></div><span className="eyebrow">A lovely choice</span><h1 className="font-display">Their hamper<br /><em>is on its way.</em></h1>
    <p>Your order <b>{completeOrder.id}</b> is safely in our studio. We’ll take care of every detail.</p>
    <div className="success-summary"><div><span>Delivering to</span><b>{completeOrder.deliveryAddress.recipientName}</b></div><div><span>Delivery date</span><b>{formatDate(completeOrder.deliveryDate)}</b></div><div><span>Total</span><b>{money.format(completeOrder.total)}</b></div></div>
    <Link href="/my-orders" className="button button-dark" data-testid="link-success-orders">See your order <ArrowRight size={16} /></Link>
  </main><SiteFooter /></Shell>;

  return <Shell>
    <main className="builder-page page-shell">
      <div className="builder-topline"><Link href="/" className="back-link" data-testid="link-back-store"><ArrowLeft size={15} /> Back to the collection</Link><span className="eyebrow">Your personal hamper</span></div>
      <div className="builder-title"><div><span className="eyebrow">Made for one person, by you</span><h1 className="font-display">Let’s make it <em>theirs.</em></h1><p>Take your time. We’ll keep all the lovely details together.</p></div><div className="builder-top-note"><LockKeyhole size={16} /><span>Your details and photo stay private.</span></div></div>

      <div className="builder-layout">
        <form className="builder-form" onSubmit={submitOrder}>
          <section id="choose-items" className="builder-section">
            <div className="section-number">01</div><div className="builder-section-content">
              <div className="builder-section-heading"><div><span className="eyebrow">The good bits</span><h2>Choose their favourites</h2></div><span className="muted-count">{chosen.length} selected</span></div>
              {productsQuery.isLoading ? <SkeletonGrid /> : productsQuery.isError ? <div className="inline-error">The collection didn’t arrive. <button type="button" onClick={() => productsQuery.refetch()}>Try again</button></div> : products.length === 0 ? <div className="inline-empty">Our shelves are being refreshed. Come back in a little while.</div> : (
                <div className="builder-products">{products.map((product) => {
                  const quantity = quantities[product.id] ?? 0;
                  return <article className={`builder-product ${quantity ? 'is-selected' : ''}`} key={product.id} data-testid={`builder-product-${product.id}`}>
                    <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" />
                    <div className="builder-product-copy"><span className="eyebrow">{product.category.replace('-', ' ')}</span><h3>{product.name}</h3><span className="builder-price">{money.format(product.price)}</span></div>
                    {quantity ? <div className="quantity-control" aria-label={`Quantity of ${product.name}`}>
                      <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product, quantity - 1)} data-testid={`button-minus-${product.id}`}><Minus size={14} /></button><span data-testid={`text-quantity-${product.id}`}>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={quantity >= 12} onClick={() => changeQuantity(product, quantity + 1)} data-testid={`button-plus-${product.id}`}><Plus size={14} /></button>
                    </div> : <button type="button" className="add-item-button" onClick={() => changeQuantity(product, 1)} aria-label={`Add ${product.name}`} data-testid={`button-add-${product.id}`}><Plus size={17} /></button>}
                  </article>;
                })}</div>
              )}
            </div>
          </section>

          <section className="builder-section">
            <div className="section-number">02</div><div className="builder-section-content">
              <div className="builder-section-heading"><div><span className="eyebrow">A thoughtful limit</span><h2>Set their budget</h2></div></div>
              <div className="budget-control"><label htmlFor="budget">Your hamper budget</label><div className="budget-input-wrap"><span>₹</span><input id="budget" type="number" min="300" max="100000" step="100" value={budget} onChange={(event) => setBudget(event.target.value)} required data-testid="input-budget" /></div><p>Choose between ₹300 and ₹1,00,000. We’ll keep your selections in view as you go.</p></div>
              <div className="budget-meter"><div className="budget-meter-label"><span>Estimated total</span><strong>{money.format(estimatedTotal)}</strong></div><div className="meter-track"><span style={{ width: `${Math.min(100, Number(budget) > 0 ? estimatedTotal / Number(budget) * 100 : 0)}%` }} /></div><p>{estimatedTotal > Number(budget) ? 'A little over your budget — remove a piece or increase your limit.' : 'Includes your wrapping choice and ₹79 delivery.'}</p></div>
            </div>
          </section>

          <section className="builder-section">
            <div className="section-number">03</div><div className="builder-section-content">
              <div className="builder-section-heading"><div><span className="eyebrow">The finishing touch</span><h2>Choose the wrapping</h2></div></div>
              <div className="packaging-options">
                {([
                  ['none', 'Keep it simple', 'Carefully packed, without gift wrap.'],
                  ['signature', 'Studio signature', 'Soft tissue, ribbon and a handwritten note.'],
                  ['celebration', 'A little celebration', 'Our most joyful wrap, ready to be opened.'],
                ] as [PackagingOption, string, string][]).map(([value, title, copy]) => <label className={`packaging-option ${packagingOption === value ? 'selected' : ''}`} key={value}>
                  <input type="radio" name="packaging" value={value} checked={packagingOption === value} onChange={() => setPackagingOption(value)} data-testid={`radio-packaging-${value}`} />
                  <span className="radio-dot" /><span className="packaging-copy"><b>{title}</b><small>{copy}</small></span><Gift size={18} />
                </label>)}
              </div>
            </div>
          </section>

          <section className="builder-section">
            <div className="section-number">04</div><div className="builder-section-content">
              <div className="builder-section-heading"><div><span className="eyebrow">A note from you</span><h2>Make it unmistakably theirs</h2></div></div>
              <div className="field-grid">
                <label className="form-field full-field"><span>Name on the gift <small>Optional</small></span><input maxLength={50} value={personalizationName} onChange={(event) => setPersonalizationName(event.target.value)} placeholder="What do you call them?" data-testid="input-personalization-name" /></label>
                <label className="form-field full-field"><span>Your message <small>Optional · up to 300 characters</small></span><textarea maxLength={300} rows={4} value={giftMessage} onChange={(event) => setGiftMessage(event.target.value)} placeholder="A few words they’ll want to keep…" data-testid="input-gift-message" /><span className="character-count">{giftMessage.length}/300</span></label>
              </div>
              <div className="photo-upload">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void handlePhoto(event.target.files?.[0])} data-testid="input-photo" />
                {photoPath ? <div className="uploaded-photo"><span className="photo-file-icon"><Check size={17} /></span><span><b>{photoName}</b><small>Private photo attached to this gift</small></span><button type="button" aria-label="Remove photo" onClick={() => { setPhotoPath(''); setPhotoName(''); if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); setPhotoPreviewUrl(''); if (fileRef.current) fileRef.current.value = ''; }} data-testid="button-remove-photo"><Trash2 size={17} /></button></div> : <button type="button" className="upload-prompt" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-upload-photo">
                  <span className="upload-icon">{uploading ? <LoaderCircle className="spin" size={19} /> : <ImagePlus size={19} />}</span><span><b>{uploading ? 'Keeping it safe…' : 'Add one favourite photo'}</b><small>JPEG, PNG or WebP · up to 5 MB · private to your order</small></span><ArrowRight size={16} />
                </button>}
                {uploadError && <p className="inline-error" role="alert">{uploadError}</p>}
              </div>
            </div>
          </section>

          <section className="builder-section">
            <div className="section-number">05</div><div className="builder-section-content">
              <div className="builder-section-heading"><div><span className="eyebrow">The happy arrival</span><h2>Where should it go?</h2></div></div>
              <div className="field-grid">
                <label className="form-field"><span>Recipient’s name</span><input required minLength={2} maxLength={100} autoComplete="name" value={address.recipientName} onChange={(event) => changeAddress('recipientName', event.target.value)} placeholder="Full name" data-testid="input-recipient-name" /></label>
                <label className="form-field"><span>Phone number</span><input required minLength={7} maxLength={24} type="tel" autoComplete="tel" value={address.recipientPhone} onChange={(event) => changeAddress('recipientPhone', event.target.value)} placeholder="+91 98765 43210" data-testid="input-recipient-phone" /></label>
                <label className="form-field full-field"><span>Address line 1</span><input required minLength={5} maxLength={200} autoComplete="address-line1" value={address.addressLine1} onChange={(event) => changeAddress('addressLine1', event.target.value)} placeholder="House, street and neighbourhood" data-testid="input-address-line1" /></label>
                <label className="form-field full-field"><span>Address line 2 <small>Optional</small></span><input maxLength={200} autoComplete="address-line2" value={address.addressLine2 ?? ''} onChange={(event) => changeAddress('addressLine2', event.target.value)} placeholder="Apartment, landmark or a helpful detail" data-testid="input-address-line2" /></label>
                <label className="form-field"><span>City</span><input required minLength={2} maxLength={100} autoComplete="address-level2" value={address.city} onChange={(event) => changeAddress('city', event.target.value)} placeholder="City" data-testid="input-city" /></label>
                <label className="form-field"><span>State / region</span><input required minLength={2} maxLength={100} autoComplete="address-level1" value={address.region} onChange={(event) => changeAddress('region', event.target.value)} placeholder="State" data-testid="input-region" /></label>
                <label className="form-field"><span>PIN code</span><input required minLength={4} maxLength={12} autoComplete="postal-code" value={address.postalCode} onChange={(event) => changeAddress('postalCode', event.target.value)} placeholder="PIN code" data-testid="input-postal-code" /></label>
                <label className="form-field"><span>Country</span><input required minLength={2} maxLength={80} autoComplete="country-name" value={address.country} onChange={(event) => changeAddress('country', event.target.value)} data-testid="input-country" /></label>
                <label className="form-field full-field"><span>Delivery date</span><input required type="date" min={minimumDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} data-testid="input-delivery-date" /></label>
              </div>
            </div>
          </section>
          {formError && <div className="form-alert" role="alert"><CircleHelp size={19} /><span>{formError}</span></div>}
          <div className="submit-row"><div><LockKeyhole size={15} /><span>Your order details are securely handled.</span></div><button type="submit" disabled={createOrder.isPending || uploading || productsQuery.isLoading || products.length === 0} className="button button-dark submit-button" data-testid="button-place-order">{createOrder.isPending ? <><LoaderCircle className="spin" size={17} /> Saving your order…</> : <>Place their order <ArrowRight size={16} /></>}</button></div>
        </form>

        <aside className="order-aside">
          <div className="aside-sticky">
            <div className="aside-card">
              <span className="eyebrow">A little preview</span><h2 className="font-display">Made around<br /><em>someone lovely.</em></h2>
              <div className={`live-preview-wrap live-preview-${packagingOption}`}>
                <div className="preview-topline"><span className="preview-seal"><Gift size={17} /></span><span>{packagingOption === 'none' ? 'Carefully gathered' : packagingOption === 'celebration' ? 'A little celebration' : 'Studio signature'}</span></div>
                {chosen.length ? <div className="preview-product-grid">{chosen.slice(0, 6).map((product, index) => <div className={`preview-product preview-product-${index % 4}`} key={product.id}><img src={product.imageUrl} alt={product.imageAlt} /><span>{quantities[product.id]} × {product.name}</span></div>)}</div> : <div className="preview-empty"><Gift size={26} /><span>Your chosen pieces will gather here.</span></div>}
                {personalizationName.trim() && <div className="preview-label"><small>made for</small><b>{personalizationName.trim()}</b></div>}
                {giftMessage.trim() && <div className="preview-note">“{giftMessage.trim()}”</div>}
                {photoPreviewUrl && <div className="preview-photo"><img src={photoPreviewUrl} alt="Your selected personal photo" /><span>A photo for them</span></div>}
                <div className="preview-budget"><span>Budget · {money.format(Number(budget) || 0)}</span><b>{estimatedTotal > Number(budget) ? 'Over your limit' : 'Within your limit'}</b></div>
              </div>
              <p className="preview-disclaimer">A living illustration of your choices, not an exact render of the packed hamper.</p>
              {chosen.length ? <div className="aside-items">{chosen.map((product) => <div className="aside-item" key={product.id}><img src={product.imageUrl} alt="" /><span>{product.name}<small>Qty {quantities[product.id]}</small></span><b>{money.format(product.price * quantities[product.id])}</b></div>)}</div> : <div className="aside-empty"><Gift size={24} /><p>Your chosen pieces will find a home here.</p></div>}
              <div className="aside-total"><span>Selected items</span><strong data-testid="text-subtotal">{money.format(subtotal)}</strong></div>
              <div className="aside-cost-row"><span>Gift wrapping</span><strong>{money.format(packagingCharge)}</strong></div>
              <div className="aside-cost-row"><span>Delivery</span><strong>{money.format(deliveryCharge)}</strong></div>
              <div className="aside-grand-total"><span>Estimated total</span><strong data-testid="text-estimated-total">{money.format(estimatedTotal)}</strong></div>
              <div className="aside-budget"><span>Your all-in budget</span><strong>{money.format(Number(budget) || 0)}</strong></div>
              <p className="aside-footnote">Your budget includes the hamper, wrapping and delivery.</p>
            </div>
            <div className="aside-reassurance"><span className="reassurance-icon"><PackageCheck size={18} /></span><p><b>Every detail, looked after.</b><br />From the tissue paper to the doorstep.</p></div>
          </div>
        </aside>
      </div>
    </main>
  </Shell>;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function PrivatePhoto({ objectPath }: { objectPath: string }) {
  return <img className="order-photo" src={`${basePath}/api/storage${objectPath}`} alt="Private photo included with this hamper" loading="lazy" />;
}

function OrdersPage() {
  const ordersQuery = useListOrders();
  const orders = ordersQuery.data ?? [];
  return <Shell>
    <main className="orders-page page-shell">
      <div className="orders-heading"><div><span className="eyebrow">Kept close, even after sending</span><h1 className="font-display">Your <em>orders.</em></h1><p>All the thoughtful things you’ve sent, in one place.</p></div><Link href="/build" className="button button-dark" data-testid="button-new-order">Create a hamper <ArrowRight size={16} /></Link></div>
      {ordersQuery.isLoading ? <div className="orders-skeleton">{[1, 2].map((x) => <div className="order-skeleton" key={x}><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-image" /></div>)}</div> : ordersQuery.isError ? <div className="state-panel error-panel"><CircleHelp size={25} /><h2>We couldn’t open your order book.</h2><p>Your orders are still safe. Try loading them again.</p><button className="button button-dark" onClick={() => ordersQuery.refetch()} data-testid="button-retry-orders">Try again <ArrowRight size={15} /></button></div> : orders.length === 0 ? (
        <div className="orders-empty"><div className="empty-art"><Gift size={33} strokeWidth={1.4} /></div><span className="eyebrow">A blank page, for now</span><h2 className="font-display">Someone’s first<br /><em>little surprise?</em></h2><p>Your hamper orders will be saved here, so you can always find the details again.</p><Link href="/build" className="button button-dark" data-testid="button-first-order">Make your first hamper <ArrowRight size={16} /></Link></div>
      ) : <div className="orders-list">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>}
    </main>
  </Shell>;
}

function OrderCard({ order }: { order: HamperOrder }) {
  const statusLabel = order.status === 'placed' ? 'Order received' : order.status === 'preparing' ? 'Being prepared' : 'Delivered';
  return <article className="order-card" data-testid={`card-order-${order.id}`}>
    <div className="order-card-top"><div><span className="eyebrow">Order placed {formatDate(order.createdAt)}</span><h2>For {order.deliveryAddress.recipientName}</h2></div><span className={`status-pill status-${order.status}`} data-testid={`status-order-${order.id}`}><span />{statusLabel}</span></div>
    <div className="order-card-body">
      <div className="order-items">{order.items.map((item) => <div className="order-item" key={item.productId}><img src={item.imageUrl} alt={item.imageAlt} loading="lazy" /><span><b>{item.name}</b><small>{item.quantity} × {money.format(item.unitPrice)}</small></span></div>)}</div>
      <div className="order-detail-grid"><div><span>Delivery date</span><b>{formatDate(order.deliveryDate)}</b></div><div><span>To</span><b>{order.deliveryAddress.city}, {order.deliveryAddress.region}</b></div><div><span>Wrapping</span><b>{order.packagingOption.replace('-', ' ')}</b></div><div><span>Total</span><b>{money.format(order.total)}</b></div></div>
      {order.personalizationName && <div className="personalization-line"><Heart size={14} /> Made for <b>{order.personalizationName}</b></div>}
      {order.giftMessage && <blockquote className="saved-message">“{order.giftMessage}”</blockquote>}
      {order.photoObjectPath && <PrivatePhoto objectPath={order.photoObjectPath} />}
    </div>
  </article>;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { status?: number }).status;
}

function AdminPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useListAdminOrders();
  const statusMutation = useUpdateAdminOrderStatus();
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<OrderStatus | null>(null);
  const [mutationMessage, setMutationMessage] = useState('');
  const [mutationError, setMutationError] = useState('');
  const allOrders = ordersQuery.data ?? [];
  const orders = filter === 'all' ? allOrders : allOrders.filter((order) => order.status === filter);
  const updateStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    setUpdatingStatus(status);
    setMutationError('');
    setMutationMessage('');
    try {
      const saved = await statusMutation.mutateAsync({ id, data: { status } });
      queryClient.setQueryData<HamperOrder[]>(getListAdminOrdersQueryKey(), (current) =>
        current?.map((order) => order.id === saved.id ? saved : order));
      setMutationMessage(`Order ${saved.id} is now ${saved.status}.`);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The order status could not be updated. Try again.');
    } finally {
      setUpdatingId(null);
      setUpdatingStatus(null);
    }
  };

  return <Shell>
    <main className="admin-page page-shell">
      <div className="admin-heading">
        <div><span className="eyebrow">Hamper Hub · studio desk</span><h1 className="font-display">The order <em>book.</em></h1><p>Every detail, ready for the hands that make it happen.</p></div>
        <button type="button" className="admin-refresh" onClick={() => ordersQuery.refetch()} disabled={ordersQuery.isFetching} data-testid="button-refresh-admin"><RefreshCw size={15} className={ordersQuery.isFetching ? 'spin' : ''} /> Refresh orders</button>
      </div>
      {ordersQuery.isLoading ? <div className="admin-loading" aria-label="Loading studio orders">{[1, 2, 3].map((item) => <div className="admin-skeleton" key={item}><div /><span /><span /></div>)}</div> :
        ordersQuery.isError && errorStatus(ordersQuery.error) === 403 ? <div className="admin-state admin-denied"><LockKeyhole size={28} /><span className="eyebrow">Studio access only</span><h2>This order book is private.</h2><p>Your account does not have permission to view studio orders.</p></div> :
        ordersQuery.isError ? <div className="admin-state"><CircleHelp size={27} /><h2>We couldn’t open the order book.</h2><p>Order details remain protected. Please try again.</p><button className="button button-dark" onClick={() => ordersQuery.refetch()} data-testid="button-retry-admin">Try again <ArrowRight size={15} /></button></div> :
        <>
          <div className="admin-toolbar">
            <div className="admin-count"><ClipboardList size={18} /><span><b>{allOrders.length}</b> {allOrders.length === 1 ? 'order' : 'orders'} in the studio</span></div>
            <div className="admin-filters" aria-label="Filter orders by status">{(['all', 'placed', 'preparing', 'delivered'] as const).map((status) => <button type="button" key={status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)} data-testid={`filter-admin-${status}`}>{status === 'all' ? 'All orders' : status}</button>)}</div>
          </div>
          {mutationMessage && <div className="admin-feedback success" role="status" data-testid="status-admin-update"><Check size={15} />{mutationMessage}</div>}
          {mutationError && <div className="admin-feedback failure" role="alert">{mutationError}</div>}
          {!allOrders.length ? <div className="admin-state admin-empty"><Gift size={28} /><span className="eyebrow">A quiet desk</span><h2>No orders just yet.</h2><p>Newly placed hampers will appear here with everything the studio needs to prepare them.</p></div> :
            !orders.length ? <div className="admin-state admin-empty"><ClipboardList size={27} /><h2>Nothing in this section.</h2><p>Try another status filter to see more orders.</p></div> :
            <div className="admin-orders">{orders.map((order) => <article className="admin-order-card" key={order.id} data-testid={`admin-order-${order.id}`}>
              <div className="admin-order-header"><div><span className="eyebrow">Received {formatDate(order.createdAt)}</span><h2>{order.deliveryAddress.recipientName}</h2><span className="admin-order-id">Order {order.id}</span></div><span className={`status-pill status-${order.status}`}><span />{order.status === 'placed' ? 'Order received' : order.status === 'preparing' ? 'Being prepared' : 'Delivered'}</span></div>
              <div className="admin-order-main">
                <div className="admin-order-products"><span className="admin-label">In this hamper</span><div className="admin-product-list">{order.items.map((item) => <div className="admin-product" key={item.productId}><img src={item.imageUrl} alt={item.imageAlt} /><span><b>{item.name}</b><small>{item.category.replace('-', ' ')} · Qty {item.quantity}</small></span><strong>{money.format(item.quantity * item.unitPrice)}</strong></div>)}</div></div>
                <div className="admin-recipient"><span className="admin-label">Delivery details</span><div className="recipient-name">{order.deliveryAddress.recipientName}</div><div><Phone size={14} />{order.deliveryAddress.recipientPhone}</div><div><MapPin size={14} /><span>{order.deliveryAddress.addressLine1}{order.deliveryAddress.addressLine2 ? `, ${order.deliveryAddress.addressLine2}` : ''}<br />{order.deliveryAddress.city}, {order.deliveryAddress.region} {order.deliveryAddress.postalCode}<br />{order.deliveryAddress.country}</span></div><div className="delivery-date"><Truck size={14} />{formatDate(order.deliveryDate)}</div></div>
              </div>
              <div className="admin-personalization">
                <div className="admin-personal-copy"><span className="admin-label">Personal touches</span>{order.personalizationName ? <p className="personalization-line"><Heart size={14} />Made for <b>{order.personalizationName}</b></p> : <p className="admin-muted">No name on the gift</p>}{order.giftMessage ? <blockquote className="saved-message">“{order.giftMessage}”</blockquote> : <p className="admin-muted">No gift message</p>}{order.photoObjectPath && <PrivatePhoto objectPath={order.photoObjectPath} />}</div>
                <div className="admin-total-block"><span className="admin-label">Order total</span><b>{money.format(order.total)}</b><small>Items {money.format(order.itemsSubtotal)} · Wrap {money.format(order.packagingFee)} · Delivery {money.format(order.deliveryFee)}</small><small>Budget {money.format(order.budget)} · {order.packagingOption.replace('-', ' ')} wrap</small></div>
              </div>
              <div className="admin-order-footer"><span className="admin-label">Fulfillment status</span><div className="admin-status-actions">{(['placed', 'preparing', 'delivered'] as OrderStatus[]).map((status) => <button type="button" key={status} className={order.status === status ? 'selected' : ''} disabled={statusMutation.isPending || order.status === status} onClick={() => void updateStatus(order.id, status)} data-testid={`button-status-${order.id}-${status}`}>{updatingId === order.id && updatingStatus === status && statusMutation.isPending ? <LoaderCircle className="spin" size={13} /> : null}{status === 'placed' ? 'Received' : status === 'preparing' ? 'Preparing' : 'Delivered'}</button>)}</div></div>
            </article>)}</div>}
        </>}
    </main>
  </Shell>;
}

function AuthPage({ kind }: { kind: 'sign-in' | 'sign-up' }) {
  return <main className="auth-page">
    <div className="auth-atmosphere"><span className="auth-orbit orbit-one" /><span className="auth-orbit orbit-two" /><div className="auth-note"><span className="eyebrow">A little thought goes a long way</span><p>Make something<br /><em>they’ll remember.</em></p><span className="note-rule" />Hamper Hub Studio</div></div>
    <div className="auth-form-area"><Brand className="auth-brand" />
      <div className="auth-clerk">{kind === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div>
      <Link href="/" className="auth-back" data-testid="link-auth-home"><ArrowLeft size={15} /> Back to the studio</Link>
    </div>
  </main>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const priorId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (priorId.current !== undefined && priorId.current !== userId) client.clear();
      priorId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function Routes() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/build"><ProtectedPage><OrderBuilder /></ProtectedPage></Route>
    <Route path="/my-orders"><ProtectedPage><OrdersPage /></ProtectedPage></Route>
    <Route path="/admin"><ProtectedPage><AdminPage /></ProtectedPage></Route>
    <Route path="/sign-in/*?" component={() => <AuthPage kind="sign-in" />} />
    <Route path="/sign-up/*?" component={() => <AuthPage kind="sign-up" />} />
    <Route component={NotFound} />
  </Switch>;
}

function ClerkRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Your thoughtful gifts are waiting.' } },
      signUp: { start: { title: 'Join the good gift club', subtitle: 'Let’s make someone feel wonderfully known.' } },
    }}
    routerPush={(to: string) => setLocation(stripBase(to))}
    routerReplace={(to: string) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkCacheInvalidator />
      <Routes />
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');
  return <WouterRouter base={basePath}><ClerkRouter /></WouterRouter>;
}

export default App;
