/**
 * Push a failed API response back onto the form it came from.
 *
 * 422 means specific fields were rejected, so each message lands on its own
 * input where the user is looking. 409 means the input was fine and a
 * business rule refused it -- there is no field to blame, so it becomes a
 * toast instead of a phantom error under a valid input.
 */
export function applyServerErrors(error, setError, toast, { fallbackField } = {}) {
  const fields = error.fieldErrors?.() ?? {}

  if (error.isValidation && Object.keys(fields).length > 0) {
    Object.entries(fields).forEach(([field, message]) => {
      setError(field, { type: 'server', message })
    })

    return
  }

  if (fallbackField && error.isValidation) {
    setError(fallbackField, { type: 'server', message: error.message })
    return
  }

  toast?.error(error.message)
}
