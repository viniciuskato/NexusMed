import { Discipline, Theme, Compendium, CompendiumSectionSnapshot, MaterialSectionVersion } from '../types';
import { StorageService } from '../services/storage';
import { SupabaseMaterialsRepository } from './SupabaseMaterialsRepository';

import { isSupabaseConfigured } from '../lib/supabaseClient';

export interface MaterialsRepository {
  getDisciplines(): Promise<Discipline[]>;
  saveDisciplines(disciplines: Discipline[]): Promise<void>;
  getThemes(): Promise<Theme[]>;
  saveThemes(themes: Theme[]): Promise<void>;
  getCompendiums(): Promise<Compendium[]>;
  saveCompendiums(compendiums: Compendium[]): Promise<void>;
  saveCompendium(compendium: Compendium): Promise<void>;
  deleteCompendium(id: string): Promise<void>;
  publishCompendium(id: string): Promise<void>;
  unpublishCompendium(id: string): Promise<void>;
  updateSectionContent(sectionId: string, patch: Partial<CompendiumSectionSnapshot>, reason?: string): Promise<void>;
  getSectionVersions(sectionId: string): Promise<MaterialSectionVersion[]>;
  revertSectionToVersion(sectionId: string, versionId: string): Promise<void>;
  updateMaterialReferenceSource(referenceId: string, sourceId: string | null, url: string | null): Promise<void>;
}

class LocalStorageMaterialsRepository implements MaterialsRepository {
  async getDisciplines(): Promise<Discipline[]> {
    return StorageService.getDisciplines();
  }
  async saveDisciplines(disciplines: Discipline[]): Promise<void> {
    StorageService.saveDisciplines(disciplines);
  }
  async getThemes(): Promise<Theme[]> {
    return StorageService.getThemes();
  }
  async saveThemes(themes: Theme[]): Promise<void> {
    StorageService.saveThemes(themes);
  }
  async getCompendiums(): Promise<Compendium[]> {
    return StorageService.getCompendiums();
  }
  async saveCompendiums(compendiums: Compendium[]): Promise<void> {
    StorageService.saveCompendiums(compendiums);
  }
  async saveCompendium(compendium: Compendium): Promise<void> {
    StorageService.saveCompendium(compendium);
  }
  async deleteCompendium(id: string): Promise<void> {
    StorageService.deleteCompendium(id);
  }
  async publishCompendium(_id: string): Promise<void> {}
  async unpublishCompendium(_id: string): Promise<void> {}
  // Histórico de seção exige Supabase (material_section_versions não tem
  // equivalente local) — sem-op/lista vazia quando rodando só com localStorage.
  async updateSectionContent(_sectionId: string, _patch: Partial<CompendiumSectionSnapshot>, _reason?: string): Promise<void> {}
  async getSectionVersions(_sectionId: string): Promise<MaterialSectionVersion[]> {
    return [];
  }
  async revertSectionToVersion(_sectionId: string, _versionId: string): Promise<void> {}
  // Catálogo de sources/associação de referência exige Supabase (mesmo
  // motivo do histórico de seção acima) — sem-op em localStorage puro.
  async updateMaterialReferenceSource(_referenceId: string, _sourceId: string | null, _url: string | null): Promise<void> {}
}

class ResilientMaterialsRepository implements MaterialsRepository {
  private supa = new SupabaseMaterialsRepository();
  private local = new LocalStorageMaterialsRepository();

  async getDisciplines(): Promise<Discipline[]> {
    if (!isSupabaseConfigured) return this.local.getDisciplines();
    try {
      const res = await this.supa.getDisciplines();
      return res && res.length > 0 ? res : this.local.getDisciplines();
    } catch {
      return this.local.getDisciplines();
    }
  }

  async saveDisciplines(disciplines: Discipline[]): Promise<void> {
    this.local.saveDisciplines(disciplines);
    if (isSupabaseConfigured) {
      try { await this.supa.saveDisciplines(disciplines); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar saveDisciplines com Supabase:`, err); throw err; }
    }
  }

  async getThemes(): Promise<Theme[]> {
    if (!isSupabaseConfigured) return this.local.getThemes();
    try {
      const res = await this.supa.getThemes();
      return res && res.length > 0 ? res : this.local.getThemes();
    } catch {
      return this.local.getThemes();
    }
  }

  async saveThemes(themes: Theme[]): Promise<void> {
    this.local.saveThemes(themes);
    if (isSupabaseConfigured) {
      try { await this.supa.saveThemes(themes); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar saveThemes com Supabase:`, err); throw err; }
    }
  }

  async getCompendiums(): Promise<Compendium[]> {
    if (!isSupabaseConfigured) return this.local.getCompendiums();
    try {
      const res = await this.supa.getCompendiums();
      return res && res.length > 0 ? res : this.local.getCompendiums();
    } catch {
      return this.local.getCompendiums();
    }
  }

  async saveCompendiums(compendiums: Compendium[]): Promise<void> {
    this.local.saveCompendiums(compendiums);
    if (isSupabaseConfigured) {
      try { await this.supa.saveCompendiums(compendiums); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar saveCompendiums com Supabase:`, err); throw err; }
    }
  }

  async saveCompendium(compendium: Compendium): Promise<void> {
    this.local.saveCompendium(compendium);
    if (isSupabaseConfigured) {
      try { await this.supa.saveCompendium(compendium); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar saveCompendium com Supabase:`, err); throw err; }
    }
  }

  async deleteCompendium(id: string): Promise<void> {
    this.local.deleteCompendium(id);
    if (isSupabaseConfigured) {
      try { await this.supa.deleteCompendium(id); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar deleteCompendium com Supabase:`, err); throw err; }
    }
  }

  async publishCompendium(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try { await this.supa.publishCompendium(id); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar publishCompendium com Supabase:`, err); throw err; }
    }
  }

  async unpublishCompendium(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try { await this.supa.unpublishCompendium(id); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar unpublishCompendium com Supabase:`, err); throw err; }
    }
  }

  async updateSectionContent(sectionId: string, patch: Partial<CompendiumSectionSnapshot>, reason?: string): Promise<void> {
    if (!isSupabaseConfigured) return this.local.updateSectionContent(sectionId, patch, reason);
    try { await this.supa.updateSectionContent(sectionId, patch, reason); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar updateSectionContent com Supabase:`, err); throw err; }
  }

  async getSectionVersions(sectionId: string): Promise<MaterialSectionVersion[]> {
    if (!isSupabaseConfigured) return this.local.getSectionVersions(sectionId);
    try {
      return await this.supa.getSectionVersions(sectionId);
    } catch (err) {
      console.error(`[MaterialsRepository] falha ao buscar getSectionVersions do Supabase:`, err);
      throw err;
    }
  }

  async revertSectionToVersion(sectionId: string, versionId: string): Promise<void> {
    if (!isSupabaseConfigured) return this.local.revertSectionToVersion(sectionId, versionId);
    try { await this.supa.revertSectionToVersion(sectionId, versionId); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar revertSectionToVersion com Supabase:`, err); throw err; }
  }

  async updateMaterialReferenceSource(referenceId: string, sourceId: string | null, url: string | null): Promise<void> {
    if (!isSupabaseConfigured) return this.local.updateMaterialReferenceSource(referenceId, sourceId, url);
    try { await this.supa.updateMaterialReferenceSource(referenceId, sourceId, url); } catch (err) { console.error(`[MaterialsRepository] falha ao sincronizar updateMaterialReferenceSource com Supabase:`, err); throw err; }
  }
}

export const materialsRepository: MaterialsRepository = new ResilientMaterialsRepository();
