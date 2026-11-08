const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Неверный email или пароль",
  USER_ALREADY_EXISTS: "Пользователь с таким email уже зарегистрирован",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Пользователь с таким email уже зарегистрирован",
  PASSWORD_TOO_SHORT: "Пароль слишком короткий",
  PASSWORD_TOO_LONG: "Пароль слишком длинный",
  INVALID_TOKEN: "Ссылка недействительна или устарела. Запросите восстановление ещё раз",
  INVALID_PASSWORD: "Неверный текущий пароль",
  INVALID_EMAIL: "Некорректный email",
};

/** Человекочитаемое сообщение для ошибки Better Auth. */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined) {
  if (!error) return "Неизвестная ошибка";
  if (error.status === 429) return "Слишком много попыток. Подождите минуту и попробуйте снова";
  return (error.code && MESSAGES[error.code]) || "Не удалось выполнить запрос. Попробуйте ещё раз";
}
