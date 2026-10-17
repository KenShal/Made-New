import { catalog } from './catalog';
import { useResource } from '@/hooks/useResource';

/** Loads the public catalogue in one go: products, creators, campaigns, collections. */
export function useCatalogData() {
  return useResource(async () => {
    const [products, creators, campaigns, collections] = await Promise.all([catalog.listProducts(), catalog.listCreators(), catalog.listCampaigns(), catalog.listCollections()]);
    return { products, creators, campaigns, collections };
  }, []);
}
