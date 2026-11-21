/**
 * The panel's forms inside modals and drawers set the label of a field to weight 500 field by field (`styles={{ label: {
 * fontWeight: 500 } }}`, for example in src/shared/ui/forms/users/forms-components/*); the theme's default is 600, which
 * the page-level settings cards keep.
 */
export const LABEL_WEIGHT = { label: { fontWeight: 500 } } as const;
