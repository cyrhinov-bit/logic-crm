export class ReleaseNotesService {
  static async getNotes(_version: string): Promise<string> {
    return "- Améliorations de performance\n- Correction de bugs mineurs";
  }
}
