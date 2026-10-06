// @ts-check
import { Comment, Converter, ReflectionKind } from 'typedoc';

/**
 * `@mergeModuleWith <project>` moves a module's exports into the project but drops the
 * module comment. Keep it as the project comment so the API index still opens with it.
 *
 * @param {import('typedoc').Application} app
 */
export function load(app) {
  app.converter.on(
    Converter.EVENT_RESOLVE_BEGIN,
    (context) => {
      const { project } = context;
      for (const mod of project.getReflectionsByKind(ReflectionKind.SomeModule)) {
        const tag = mod.comment?.getTag('@mergeModuleWith');
        if (!mod.comment || !tag || project.comment) continue;
        if (Comment.combineDisplayParts(tag.content) !== '<project>') continue;
        project.comment = mod.comment.clone();
        project.comment.removeTags('@mergeModuleWith');
      }
    },
    // Runs before TypeDoc's MergeModuleWithPlugin, which uses priority 10000.
    10001,
  );
}
